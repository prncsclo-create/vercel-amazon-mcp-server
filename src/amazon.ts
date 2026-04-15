import type { Page } from 'puppeteer-core';
import { withAmazonPage } from './browser';
import type { AddToCartParams, OperationResult } from './types';

const AMAZON_DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.com';
const BASE_URL = `https://www.${AMAZON_DOMAIN}`;

async function waitForElement(page: Page, selector: string, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

export async function searchProducts(query: string, sessionToken?: string): Promise<OperationResult> {
  return await withAmazonPage(sessionToken, async (page) => {
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
      await page.waitForSelector('#twotabsearchtextbox');
      await page.type('#twotabsearchtextbox', query);
      await page.click('#nav-search-submit-button');
      await page.waitForSelector('[data-component-type="s-search-result"]');

      const results = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[data-component-type="s-search-result"]')) as Element[];
        return items.slice(0, 5).map((item: Element) => {
          const titleEl = item.querySelector('h2 a span');
          const priceWhole = item.querySelector('.a-price-whole');
          const priceFraction = item.querySelector('.a-price-fraction');
          const ratingEl = item.querySelector('.a-icon-star-small span');
          const imageEl = item.querySelector('img.s-image');
          const asinAttr = item.getAttribute('data-asin');

          return {
            title: titleEl?.textContent?.trim() || 'Unknown',
            price: priceWhole && priceFraction ? `$${priceWhole.textContent}${priceFraction.textContent}` : 'Price not available',
            rating: ratingEl?.textContent?.trim() || 'No rating',
            imageUrl: imageEl?.getAttribute('src') || '',
            asin: asinAttr || '',
          };
        });
      });

      return {
        success: true,
        message: `Found ${results.length} products`,
        data: results,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to search products',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export async function addToCart(params: AddToCartParams): Promise<OperationResult> {
  return await withAmazonPage(params.sessionToken, async (page) => {
    try {
      const quantity = params.quantity || 1;

      if (params.asin) {
        await page.goto(`${BASE_URL}/dp/${params.asin}`, { waitUntil: 'networkidle2' });
      } else if (params.query) {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await page.waitForSelector('#twotabsearchtextbox');
        await page.type('#twotabsearchtextbox', params.query);
        await page.click('#nav-search-submit-button');
        await page.waitForSelector('[data-component-type="s-search-result"] h2 a');
        await page.click('[data-component-type="s-search-result"] h2 a');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      } else {
        throw new Error('Either query or asin must be provided');
      }

      const title = await page.evaluate(() => {
        const titleEl = document.querySelector('#productTitle');
        return titleEl?.textContent?.trim() || 'Unknown Product';
      });

      if (quantity > 1) {
        const quantityExists = await waitForElement(page, '#quantity');
        if (quantityExists) {
          await page.select('#quantity', String(quantity));
        }
      }

      const addToCartButton = await page.$('#add-to-cart-button');
      if (!addToCartButton) {
        throw new Error('Add to Cart button not found');
      }

      await addToCartButton.click();
      await waitForElement(page, '#sw-atc-confirmation, #NATC_SMART_WAGON_CONF_MSG_SUCCESS', 3000);

      return {
        success: true,
        message: `Added "${title}" to cart (quantity: ${quantity})`,
        data: { title, quantity },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to add item to cart',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export async function getCart(sessionToken?: string): Promise<OperationResult> {
  return await withAmazonPage(sessionToken, async (page) => {
    try {
      await page.goto(`${BASE_URL}/gp/cart/view.html`, { waitUntil: 'networkidle2' });

      const emptyCart = await page.$('.sc-your-amazon-cart-is-empty');
      if (emptyCart) {
        return {
          success: true,
          message: 'Cart is empty',
          data: { items: [], total: '$0.00' },
        };
      }

      const items = await page.evaluate(() => {
        const cartItems = Array.from(document.querySelectorAll('[data-name="Active Items"] .sc-list-item')) as Element[];
        return cartItems.map((item: Element) => {
          const titleEl = item.querySelector('.sc-product-title');
          const priceEl = item.querySelector('.sc-product-price');
          const quantityEl = item.querySelector('[name^="quantity"]') as HTMLSelectElement;
          const imageEl = item.querySelector('img');
          const asinAttr = item.getAttribute('data-asin');

          return {
            title: titleEl?.textContent?.trim() || 'Unknown',
            price: priceEl?.textContent?.trim() || 'N/A',
            quantity: quantityEl?.value ? parseInt(quantityEl.value) : 1,
            asin: asinAttr || '',
            imageUrl: imageEl?.getAttribute('src') || '',
          };
        });
      });

      const subtotal = await page.evaluate(() => {
        const subtotalEl = document.querySelector('#sc-subtotal-amount-activecart .sc-price');
        return subtotalEl?.textContent?.trim() || '$0.00';
      });

      return {
        success: true,
        message: `Cart contains ${items.length} item(s)`,
        data: { items, subtotal },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get cart contents',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export async function checkLoginStatus(sessionToken?: string): Promise<OperationResult> {
  return await withAmazonPage(sessionToken, async (page) => {
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

      const loginInfo = await page.evaluate(() => {
        const accountList = document.querySelector('#nav-link-accountList-nav-line-1');
        const accountText = accountList?.textContent?.trim() || '';
        const isLoggedIn = accountText.includes('Hello');
        const cookieCount = document.cookie.split(';').filter((cookie) => cookie.trim()).length;

        return {
          isLoggedIn,
          accountText,
          cookieCount,
        };
      });

      return {
        success: true,
        message: loginInfo.isLoggedIn ? `Logged in to Amazon (${loginInfo.accountText})` : 'Not logged in',
        data: loginInfo,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to check login status',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
