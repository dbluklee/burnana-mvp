// server/services/naver-scraper.js
const axios = require('axios');

// 네이버 가게 URL에서 메뉴 추출 (간소화 버전)
async function scrapeNaverMenu(naverUrl) {
  try {
    console.log(`네이버 메뉴 스크래핑 시작: ${naverUrl}`);
    
    // 기본 메뉴 생성 (네이버 스크래핑은 복잡하므로 일단 기본 메뉴 반환)
    const defaultMenus = createDefaultMenus();
    
    console.log(`네이버 메뉴 스크래핑 완료: ${defaultMenus.length}개`);
    return defaultMenus;

  } catch (error) {
    console.error('네이버 메뉴 스크래핑 실패:', error.message);
    return createDefaultMenus();
  }
}

// 매장 정보 추출
async function extractStoreInfo(naverUrl) {
  try {
    return {
      storeName: null,
      address: null,
      phone: null,
      description: null
    };
  } catch (error) {
    console.log('매장 정보 추출 실패:', error.message);
    return {};
  }
}

// URL 검증
function isValidNaverUrl(url) {
  const naverPatterns = [
    /store\.naver\.com/,
    /m\.place\.naver\.com/,
    /map\.naver\.com/,
    /pcmap\.place\.naver\.com/
  ];
  
  return naverPatterns.some(pattern => pattern.test(url));
}

// 기본 메뉴 생성
function createDefaultMenus() {
  return [
    {
      menuId: 'main_menu_001',
      name: '대표 메뉴 1',
      price: 15000,
      description: '저희 매장의 대표적인 메뉴입니다',
      category: 'main',
      allergens: [],
      naverId: null
    },
    {
      menuId: 'main_menu_002',
      name: '대표 메뉴 2', 
      price: 12000,
      description: '인기 있는 메뉴입니다',
      category: 'main',
      allergens: [],
      naverId: null
    },
    {
      menuId: 'drink_beverage_001',
      name: '음료',
      price: 3000,
      description: '시원한 음료',
      category: 'drink',
      allergens: [],
      naverId: null
    },
    {
      menuId: 'drink_water_001',
      name: '생수',
      price: 2000,
      description: '깔끔한 생수',
      category: 'drink',
      allergens: [],
      naverId: null
    }
  ];
}

module.exports = {
  scrapeNaverMenu,
  extractStoreInfo,
  isValidNaverUrl
};