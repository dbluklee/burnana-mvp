// server/routes/auth.js
const express = require('express');
const router = express.Router();

// 데이터베이스 및 네이버 스크래핑 모듈
const { 
  createStore, 
  checkDuplicateStore, 
  saveMenus, 
  getMenusByStore 
} = require('../database/db');
const { scrapeNaverMenu, extractStoreInfo } = require('../services/naver-scraper');

// 회원가입 API
router.post('/signup', async (req, res) => {
  try {
    const {
      businessNumber,
      storeName,
      ownerName,
      phone,
      email,
      address,
      naverStoreUrl,
      planType,
      deviceCount
    } = req.body;

    // 입력 데이터 검증
    const validation = validateSignupData(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: '입력 데이터가 올바르지 않습니다.',
        details: validation.errors
      });
    }

    console.log(`📝 [가입 신청] ${storeName} (사업자번호: ${businessNumber})`);

    // 1단계: 중복 매장 확인
    const existingStore = await checkDuplicateStore(businessNumber);
    if (existingStore) {
      return res.status(409).json({
        error: '이미 등록된 사업자등록번호입니다.',
        existingStore: existingStore.store_name
      });
    }

    // 2단계: 네이버 메뉴 스크래핑 (백그라운드에서 진행)
    let menuPromise = null;
    let storeInfoPromise = null;
    
    if (naverStoreUrl) {
      console.log(`🕷️ [${storeName}] 네이버 메뉴 스크래핑 시작`);
      menuPromise = scrapeNaverMenu(naverStoreUrl);
      storeInfoPromise = extractStoreInfo(naverStoreUrl);
    }

    // 3단계: 매장 정보 저장
    const storeData = {
      businessNumber,
      storeName,
      ownerName,
      phone,
      email,
      address,
      naverStoreUrl,
      planType,
      deviceCount: planType === 'integrated' ? deviceCount : 0
    };

    const newStore = await createStore(storeData);
    console.log(`🏪 [매장 ${newStore.id}] 매장 등록 완료: ${newStore.store_name}`);

    // 4단계: 네이버 스크래핑 결과 처리
    let menuCount = 0;
    let scrapingSuccess = false;

    if (menuPromise) {
      try {
        const [scrapedMenus, storeInfo] = await Promise.all([
          menuPromise,
          storeInfoPromise || Promise.resolve({})
        ]);

        if (scrapedMenus && scrapedMenus.length > 0) {
          await saveMenus(newStore.id, scrapedMenus);
          menuCount = scrapedMenus.length;
          scrapingSuccess = true;
          
          console.log(`🍽️ [매장 ${newStore.id}] 네이버 메뉴 ${menuCount}개 저장 완료`);
        }
      } catch (scrapingError) {
        console.error(`❌ [매장 ${newStore.id}] 네이버 스크래핑 실패:`, scrapingError.message);
        // 스크래핑 실패해도 가입은 완료
      }
    }

    // 5단계: 성공 응답
    const responseData = {
      success: true,
      message: `🎉 ${storeName} 가입이 완료되었습니다!`,
      storeId: newStore.id,
      storeName: newStore.store_name,
      planType,
      deviceCount: planType === 'integrated' ? deviceCount : 0,
      createdAt: newStore.created_at
    };

    // 네이버 메뉴 스크래핑 결과 추가
    if (naverStoreUrl) {
      responseData.menuScraping = {
        success: scrapingSuccess,
        menuCount,
        message: scrapingSuccess 
          ? `네이버에서 메뉴 ${menuCount}개를 자동으로 등록했습니다!`
          : '네이버 메뉴 가져오기에 실패했습니다. 직접 메뉴를 등록해주세요.'
      };
    }

    // 가입 완료 로그
    console.log(`✅ [매장 ${newStore.id}] 가입 완료 - 플랜: ${planType}, 메뉴: ${menuCount}개`);

    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ 회원가입 처리 실패:', error);
    
    res.status(500).json({
      error: '회원가입 처리 중 오류가 발생했습니다.',
      message: '잠시 후 다시 시도해주세요.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 입력 데이터 검증
function validateSignupData(data) {
  const errors = [];

  // 필수 필드 검증
  const requiredFields = ['businessNumber', 'storeName', 'ownerName', 'phone', 'address'];
  
  requiredFields.forEach(field => {
    if (!data[field] || data[field].toString().trim() === '') {
      errors.push(`${field}는 필수 입력 항목입니다.`);
    }
  });

  // 사업자등록번호 검증 (10자리 숫자)
  if (data.businessNumber) {
    const cleanBusinessNumber = data.businessNumber.replace(/\D/g, '');
    if (cleanBusinessNumber.length !== 10) {
      errors.push('사업자등록번호는 10자리여야 합니다.');
    }
  }

  // 전화번호 검증
  if (data.phone) {
    const cleanPhone = data.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      errors.push('올바른 전화번호 형식이 아닙니다.');
    }
  }

  // 이메일 검증 (선택사항이지만 입력된 경우)
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('올바른 이메일 형식이 아닙니다.');
  }

  // 플랜 타입 검증
  if (!['mobile', 'integrated'].includes(data.planType)) {
    errors.push('올바른 서비스 플랜을 선택해주세요.');
  }

  // 통합 플랜의 경우 디바이스 수량 검증
  if (data.planType === 'integrated') {
    const deviceCount = parseInt(data.deviceCount);
    if (isNaN(deviceCount) || deviceCount < 1 || deviceCount > 50) {
      errors.push('디바이스 수량은 1-50개 사이여야 합니다.');
    }
  }

  // 네이버 URL 검증 (선택사항이지만 입력된 경우)
  if (data.naverStoreUrl) {
    try {
      const url = new URL(data.naverStoreUrl);
      if (!url.hostname.includes('naver.com')) {
        errors.push('올바른 네이버 가게 URL이 아닙니다.');
      }
    } catch {
      errors.push('올바른 URL 형식이 아닙니다.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// 매장 존재 여부 확인 API
router.get('/check-store/:businessNumber', async (req, res) => {
  try {
    const { businessNumber } = req.params;
    const cleanBusinessNumber = businessNumber.replace(/\D/g, '');

    if (cleanBusinessNumber.length !== 10) {
      return res.status(400).json({
        error: '올바른 사업자등록번호를 입력해주세요.'
      });
    }

    const existingStore = await checkDuplicateStore(cleanBusinessNumber);

    res.json({
      exists: !!existingStore,
      storeName: existingStore?.store_name || null
    });

  } catch (error) {
    console.error('매장 중복 확인 실패:', error);
    res.status(500).json({
      error: '확인 중 오류가 발생했습니다.'
    });
  }
});

// 네이버 URL 미리보기 API
router.post('/preview-naver', async (req, res) => {
  try {
    const { naverUrl } = req.body;

    if (!naverUrl) {
      return res.status(400).json({
        error: '네이버 URL이 필요합니다.'
      });
    }

    console.log(`🔍 네이버 URL 미리보기: ${naverUrl}`);

    // 네이버 URL에서 기본 정보 추출
    const storeInfo = await extractStoreInfo(naverUrl);
    
    // 간단한 메뉴 개수 확인 (실제 스크래핑은 하지 않고 예상치만)
    const menuPreview = await scrapeNaverMenu(naverUrl);
    
    res.json({
      success: true,
      preview: {
        storeName: storeInfo.storeName || '매장명 확인 필요',
        address: storeInfo.address || '주소 확인 필요',
        phone: storeInfo.phone || null,
        estimatedMenuCount: menuPreview?.length || 0,
        message: menuPreview?.length > 0 
          ? `약 ${menuPreview.length}개의 메뉴를 찾았습니다!`
          : '메뉴를 찾지 못했습니다. 직접 등록이 필요할 수 있습니다.'
      }
    });

  } catch (error) {
    console.error('네이버 URL 미리보기 실패:', error);
    res.status(200).json({
      success: false,
      preview: {
        storeName: '정보를 가져올 수 없습니다',
        estimatedMenuCount: 0,
        message: '네이버 페이지에 접근할 수 없습니다. URL을 확인해주세요.'
      }
    });
  }
});

// 가입 후 매장 정보 조회 API
router.get('/store/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    
    const store = await getStoreById(parseInt(storeId));
    if (!store) {
      return res.status(404).json({
        error: '매장을 찾을 수 없습니다.'
      });
    }

    const menus = await getMenusByStore(parseInt(storeId));

    res.json({
      store: {
        id: store.id,
        businessNumber: store.business_number,
        storeName: store.store_name,
        ownerName: store.owner_name,
        phone: store.phone,
        email: store.email,
        address: store.address,
        planType: store.plan_type,
        deviceCount: store.device_count,
        status: store.status,
        createdAt: store.created_at
      },
      menus: menus,
      statistics: {
        totalMenus: menus.length,
        menuCategories: [...new Set(menus.map(m => m.category))],
        averagePrice: menus.length > 0 
          ? Math.round(menus.reduce((sum, m) => sum + m.price, 0) / menus.length)
          : 0
      }
    });

  } catch (error) {
    console.error('매장 정보 조회 실패:', error);
    res.status(500).json({
      error: '매장 정보 조회 중 오류가 발생했습니다.'
    });
  }
});

// 매장별 메뉴 수정 API (가입 후 사용)
router.put('/store/:storeId/menus', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { menus } = req.body;

    if (!Array.isArray(menus)) {
      return res.status(400).json({
        error: '메뉴 데이터가 올바르지 않습니다.'
      });
    }

    // 메뉴 데이터 검증
    const validMenus = menus.filter(menu => 
      menu.name && 
      menu.price && 
      menu.price > 0 && 
      menu.name.trim().length > 0
    );

    if (validMenus.length === 0) {
      return res.status(400).json({
        error: '유효한 메뉴가 없습니다.'
      });
    }

    await saveMenus(parseInt(storeId), validMenus);

    console.log(`🍽️ [매장 ${storeId}] 메뉴 ${validMenus.length}개 업데이트`);

    res.json({
      success: true,
      message: `메뉴 ${validMenus.length}개가 업데이트되었습니다.`,
      updatedCount: validMenus.length
    });

  } catch (error) {
    console.error('메뉴 업데이트 실패:', error);
    res.status(500).json({
      error: '메뉴 업데이트 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;