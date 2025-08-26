const axios = require('axios');

/**
 * 네이버 링크에서 가게 ID를 추출하는 클래스
 */
class NaverUrlParser {
  constructor() {
    this.timeout = 10000; // 10초 타임아웃
  }

  /**
   * 네이버 링크에서 가게 ID를 추출
   * @param {string} url - 네이버 가게 URL
   * @returns {Promise<string|null>} 가게 ID 또는 null
   */
  async extractStoreId(url) {
    try {
      console.log(`🔍 [네이버 파서] URL 분석 시작: ${url}`);
      
      // URL 유효성 검사
      if (!this.isValidNaverUrl(url)) {
        console.log(`❌ [네이버 파서] 유효하지 않은 네이버 URL: ${url}`);
        return null;
      }

      // 직접 URL에서 ID 추출 시도
      const directId = this.extractIdFromUrl(url);
      if (directId) {
        console.log(`✅ [네이버 파서] URL에서 직접 ID 추출: ${directId}`);
        return directId;
      }

      // 리다이렉트를 따라가서 ID 추출
      const redirectId = await this.extractIdFromRedirect(url);
      if (redirectId) {
        console.log(`✅ [네이버 파서] 리다이렉트에서 ID 추출: ${redirectId}`);
        return redirectId;
      }

      console.log(`❌ [네이버 파서] 가게 ID 추출 실패: ${url}`);
      return null;

    } catch (error) {
      console.error(`❌ [네이버 파서] 오류 발생:`, error.message);
      return null;
    }
  }

  /**
   * 네이버 URL 유효성 검사
   * @param {string} url - 검사할 URL
   * @returns {boolean} 유효성 여부
   */
  isValidNaverUrl(url) {
    try {
      const urlObj = new URL(url);
      const naverDomains = ['naver.com', 'naver.me', 'smartplace.naver.com'];
      return naverDomains.some(domain => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  }

  /**
   * URL에서 직접 가게 ID 추출
   * @param {string} url - 네이버 URL
   * @returns {string|null} 가게 ID 또는 null
   */
  extractIdFromUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // 다양한 네이버 URL 패턴에서 ID 추출
      const patterns = [
        // smartplace.naver.com/restaurant/ID
        /\/restaurant\/(\d+)/,
        // map.naver.com/v5/entry/place/ID
        /\/place\/(\d+)/,
        // naver.me/XXXXX (단축 URL은 리다이렉트 필요)
        /\/[A-Za-z0-9]+$/
      ];

      for (const pattern of patterns) {
        const match = urlObj.pathname.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 리다이렉트를 따라가서 가게 ID 추출
   * @param {string} url - 네이버 URL
   * @returns {Promise<string|null>} 가게 ID 또는 null
   */
  async extractIdFromRedirect(url) {
    try {
      console.log(`🔄 [네이버 파서] 리다이렉트 추적 시작: ${url}`);
      
      const response = await axios.get(url, {
        timeout: this.timeout,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const finalUrl = response.request.res.responseUrl || response.config.url;
      console.log(`🔄 [네이버 파서] 최종 URL: ${finalUrl}`);

      // 최종 URL에서 ID 추출
      const storeId = this.extractIdFromUrl(finalUrl);
      
      if (storeId) {
        console.log(`✅ [네이버 파서] 리다이렉트에서 ID 추출 성공: ${storeId}`);
        return storeId;
      }

      // HTML 내용에서 ID 추출 시도
      const htmlId = this.extractIdFromHtml(response.data);
      if (htmlId) {
        console.log(`✅ [네이버 파서] HTML에서 ID 추출 성공: ${htmlId}`);
        return htmlId;
      }

      return null;

    } catch (error) {
      console.error(`❌ [네이버 파서] 리다이렉트 추적 실패:`, error.message);
      return null;
    }
  }

  /**
   * HTML 내용에서 가게 ID 추출
   * @param {string} html - HTML 내용
   * @returns {string|null} 가게 ID 또는 null
   */
  extractIdFromHtml(html) {
    try {
      // 다양한 패턴으로 ID 추출 시도
      const patterns = [
        // "placeId":"1234567890"
        /"placeId"\s*:\s*"(\d+)"/,
        // data-place-id="1234567890"
        /data-place-id\s*=\s*"(\d+)"/,
        // /restaurant/1234567890
        /\/restaurant\/(\d+)/,
        // /place/1234567890
        /\/place\/(\d+)/
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 네이버 링크를 표준 형식으로 변환
   * @param {string} storeId - 가게 ID
   * @returns {string} 표준 네이버 링크
   */
  generateStandardUrl(storeId) {
    return `https://smartplace.naver.com/restaurant/${storeId}`;
  }
}

module.exports = NaverUrlParser;
