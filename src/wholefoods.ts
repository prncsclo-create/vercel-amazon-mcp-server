import type { Page } from 'puppeteer-core';
import { withAmazonPage } from './browser';
import type { OperationResult } from './types';

const AMAZON_DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.com';
const WHOLEFOODS_STOREFRONT = `https://www.${AMAZON_DOMAIN}/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz`;
const WHOLEFOODS_CART = `https://www.${AMAZON_DOMAIN}/cart/localmarket?almBrandId=VUZHIFdob2xlIEZvb2Rz`;

async function waitForElement(page: Page, selector: string, timeout = 8000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function ensureWholeFoodsStorefront(page: Page): Promise<void> {
  await page.goto(WHOLEFOODS_STOREFRONT, { waitUntil: 'networkidle2' });

  const addressModal = await waitForElement(page, '[data-testid="address-modal"], .alm-location-modal, #alm-toast-container', 3000);
  if (addressModal) {
    const dismissBtn = await page.$('[data-testid="address-modal"] button, .alm-location-modal button, #alm-toast-container button');
    if (dismissBtn) {
      await dismissBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export async function searchWholeFoods(query: string, sessionToken?: string): Promise<OperationResult> {
  return await withAmazonPage(sessionToken, async (page) => {
    try {
      await ensureWholeFoodsStorefront(page);

      const searchBox = await page.$('#twotabsearchtextbox');
      if (!searchBox) {
        throw new Error('Search box not found on Whole Foods storefront');
      }

      await page.click('#twotabsearchtextbox', { clickCount: 3 });
      await page.type('#twotabsearchtextbox', query);
      await page.click('#nav-search-submit-button');

      const hasResults = await waitForElement(page, '[data-component-type="s-search-result"], .s-result-item, [data-asin]', 10000);
      if (!hasResults) {
        return {
          success: true,
          message: `No Whole Foods results found for "${query}"`,
          data: [],
        };
      }

      const results = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[data-component-type="s-search-result"], [data-asin]')) as Element[];
        return items.slice(0, 8).map((item: Element) => {
          const titleEl = item.querySelector('h2 a span, .a-text-normal');
          const priceWhole = item.querySelector('.a-price-whole');
          const priceFraction = item.querySelector('.a-price-fraction');
          const perUnitEl = item.querySelector('.a-price + .a-size-base, .a-price ~ span');
          const ratingEl = item.querySelector('.a-icon-star-small span, .a-icon-alt');
          const imageEl = item.querySelector('img.s-image');
          const asinAttr = item.getAttribute('data-asin');
          const linkEl = item.querySelector('h2 a, a.a-link-normal');

          return {
            title: titleEl?.textContent?.trim() || 'Unknown',
            price: priceWhole && priceFraction ? `$${priceWhole.textContent}${priceFraction.textContent}` : 'Price not available',
            perUnit: perUnitEl?.textContent?.trim() || '',
            rating: ratingEl?.textContent?.trim() || 'No rating',
            imageUrl: imageEl?.getAttribute('src') || '',
            asin: asinAttr || '',
            url: linkEl?.getAttribute('href') || '',
          };
        }).filter((item) => item.asin);
      });

      return {
        success: true,
        message: `Found ${results.length} Whole Foods products for "${query}"`,
        data: results,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to search Whole Foods products',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export async function addToWholeFoodsCart(params: { query?: string; asin?: string; quantity?: number; sessionToken?: string }): Promise<OperationResult> {
  return await withAmazonPage(params.sessionToken, async (page) => {
    try {
      const quantity = params.quantity || 1;

      if (params.asin) {
        await page.goto(`https://www.${AMAZON_DOMAIN}/dp/${params.asin}?almBrandId=VUZHIFdob2xlIEZvb2Rz`, { waitUntil: 'networkidle2' });
        await waitForElement(page, '#productTitle, #add-to-cart-button-grocery, #add-to-cart-button', 10000);
      } else if (params.query) {
        await ensureWholeFoodsStorefront(page);

        const searchBox = await page.$('#twotabsearchtextbox');
        if (!searchBox) throw new Error('Search box not found');

        await page.click('#twotabsearchtextbox', { clickCount: 3 });
        await page.type('#twotabsearchtextbox', params.query);
        await page.click('#nav-search-submit-button');

        const hasResults = await waitForElement(page, '[data-component-type="s-search-result"] h2 a, [data-asin] h2 a', 10000);
        if (!hasResults) {
          throw new Error(`No Whole Foods results found for "${params.query}"`);
        }

        await page.click('[data-component-type="s-search-result"] h2 a, [data-asin] h2 a');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      } else {
        throw new Error('Either query or asin must be provided');
      }

      const pageState = await page.evaluate(() => {
        const titleEl = document.querySelector('#productTitle, #title');
        return {
          title: titleEl?.textContent?.trim() || '',
          hasCaptcha: !!document.querySelector('#captchacharacters'),
          hasSignIn: !!document.querySelector('#ap_email, #signInSubmit'),
        };
      });

      const title = pageState.title || 'Unknown Product';
      const addButtonSelectors = [
        '#add-to-cart-button-grocery',
        '#add-to-cart-button',
        '#freshAddToCartButton',
        '#add-to-fresh-cart-button',
        '#add-to-cart-button-ubb',
        'input[name="submit.add-to-cart"]',
        '.qs-widget-summary-atc',
        '#add-to-fresh-cart',
      ];

      if (quantity > 1) {
        const qtySelect = await page.$('#quantity');
        if (qtySelect) {
          await page.select('#quantity', String(quantity));
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      await page.evaluate(() => window.scrollBy(0, 300));
      await new Promise((resolve) => setTimeout(resolve, 1000));

      let clicked = false;
      for (const selector of addButtonSelectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        throw new Error('Add to cart button not found — this item may not be available for Whole Foods / Fresh delivery');
      }

      await waitForElement(page, '#sw-atc-confirmation, #NATC_SMART_WAGON_CONF_MSG_SUCCESS, .a-alert-success, [data-testid="atc-confirmation"]', 5000);

      return {
        success: true,
        message: `Added "${title}" to Whole Foods cart (quantity: ${quantity})`,
        data: { title, quantity },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to add item to Whole Foods cart',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export async function getWholeFoodsCart(sessionToken?: string): Promise<OperationResult> {
  return await withAmazonPage(sessionToken, async (page) => {
    try {
      await page.goto(WHOLEFOODS_CART, { waitUntil: 'networkidle2' });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const empty = await page.evaluate(() => {
        const emptyIndicators = Array.from(document.querySelectorAll('.sc-your-amazon-cart-is-empty, .a-spacing-mini h2, [data-testid="empty-cart"]'));
        return emptyIndicators.some((el) => el.textContent?.toLowerCase().includes('empty'));
      });

      if (empty) {
        return {
          success: true,
          message: 'Whole Foods / Fresh cart is empty',
          data: { items: [], subtotal: '$0.00' },
        };
      }

      const items = await page.evaluate(() => {
        const selectors = ['.sc-list-item', '[data-testid="cart-item"]', '.a-section .sc-item-content-group'];
        let cartItems: Element[] = [];

        for (const selector of selectors) {
          cartItems = Array.from(document.querySelectorAll(selector));
          if (cartItems.length > 0) break;
        }

        return cartItems.map((item: Element) => {
          const titleEl = item.querySelector('.sc-product-title, .a-truncate-cut, a.a-link-normal');
          const priceEl = item.querySelector('.sc-product-price, .a-price .a-offscreen, .sc-item-price');
          const quantityEl = item.querySelector('[name^="quantity"], select, .sc-quantity-textfield') as HTMLSelectElement | HTMLInputElement | null;
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
        const subtotalEl = document.querySelector('#sc-subtotal-amount-activecart .sc-price, .a-price .a-offscreen, [data-testid="subtotal"]');
        return subtotalEl?.textContent?.trim() || '$0.00';
      });

      return {
        success: true,
        message: `Whole Foods cart contains ${items.length} item(s)`,
        data: { items, subtotal },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get Whole Foods cart contents',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
