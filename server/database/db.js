// server/database/db.js
const { Pool } = require('pg');

// PostgreSQL 연결 풀 생성
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'burnana_dev',
  user: process.env.DB_USER || 'dev_user',
  password: process.env.DB_PASS || 'dev_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 데이터베이스 연결 테스트
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ 데이터베이스 연결 성공');
    client.release();
  } catch (error) {
    console.error('❌ 데이터베이스 연결 실패:', error.message);
  }
}

// 매장 정보 저장
async function createStore(storeData) {
  const {
    businessNumber,
    storeName,
    ownerName,
    phone,
    email,
    address,
    naverStoreUrl,
    naverStoreId,
    planType,
    deviceCount
  } = storeData;

  const query = `
    INSERT INTO stores (business_number, store_name, owner_name, phone, email, address, naver_store_url, naver_store_id, plan_type, device_count)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, business_number, store_name, created_at
  `;

  const values = [
    businessNumber,
    storeName,
    ownerName,
    phone,
    email,
    address,
    naverStoreUrl,
    naverStoreId || null,
    planType,
    deviceCount
  ];

  try {
    const result = await pool.query(query, values);
    const store = result.rows[0];
    
    console.log(`🏪 [매장 ${store.id}] 새 매장 등록: ${store.store_name}`);
    
    // 기본 테이블 생성 (8개)
    await createDefaultTables(store.id);
    
    return store;
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('이미 등록된 사업자등록번호입니다.');
    }
    throw error;
  }
}

// 기본 테이블 생성
async function createDefaultTables(storeId, tableCount = 8) {
  const query = `
    INSERT INTO store_tables (store_id, table_number, capacity)
    SELECT $1, generate_series(1, $2), 4
  `;
  
  try {
    await pool.query(query, [storeId, tableCount]);
    console.log(`📋 [매장 ${storeId}] 기본 테이블 ${tableCount}개 생성`);
  } catch (error) {
    console.error('테이블 생성 실패:', error);
    throw error;
  }
}

// 메뉴 저장/업데이트
async function saveMenus(storeId, menus) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const [index, menu] of menus.entries()) {
      const query = `
        INSERT INTO menus (store_id, menu_id, name, price, description, category, allergens, image_url, display_order, naver_menu_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (store_id, menu_id) DO UPDATE SET
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const values = [
        storeId,
        menu.menuId,
        menu.name,
        menu.price,
        menu.description || null,
        menu.category || 'main',
        menu.allergens ? JSON.stringify(menu.allergens) : null,
        menu.imageUrl || null,
        index + 1,
        menu.naverId || null
      ];
      
      await client.query(query, values);
    }
    
    await client.query('COMMIT');
    console.log(`🍽️ [매장 ${storeId}] 메뉴 ${menus.length}개 저장 완료`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// 매장별 메뉴 조회
async function getMenusByStore(storeId) {
  const query = `
    SELECT menu_id, name, price, description, category, allergens, image_url, is_available
    FROM menus 
    WHERE store_id = $1 AND is_available = true 
    ORDER BY display_order ASC, name ASC
  `;
  
  try {
    const result = await pool.query(query, [storeId]);
    return result.rows.map(row => ({
      id: row.menu_id,
      name: row.name,
      price: row.price,
      description: row.description,
      category: row.category,
      allergens: row.allergens ? JSON.parse(row.allergens) : []
    }));
  } catch (error) {
    console.error('메뉴 조회 실패:', error);
    throw error;
  }
}

// 매장 정보 조회
async function getStoreById(storeId) {
  const query = `
    SELECT id, business_number, store_name, owner_name, phone, email, address, 
           plan_type, device_count, status, created_at
    FROM stores 
    WHERE id = $1
  `;
  
  try {
    const result = await pool.query(query, [storeId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('매장 정보 조회 실패:', error);
    throw error;
  }
}

// 사업자등록번호로 매장 중복 체크
async function checkDuplicateStore(businessNumber) {
  const query = 'SELECT id, store_name FROM stores WHERE business_number = $1';
  
  try {
    const result = await pool.query(query, [businessNumber]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('매장 중복 체크 실패:', error);
    throw error;
  }
}

module.exports = {
  pool,
  testConnection,
  createStore,
  saveMenus,
  getMenusByStore,
  getStoreById,
  checkDuplicateStore
};