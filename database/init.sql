-- database/init.sql
-- Burnana MVP 데이터베이스 초기화 스크립트

-- 사업자/매장 정보 테이블
CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    business_number VARCHAR(12) UNIQUE NOT NULL, -- 사업자등록번호
    store_name VARCHAR(100) NOT NULL,           -- 상호명
    owner_name VARCHAR(50) NOT NULL,            -- 대표자명
    phone VARCHAR(20) NOT NULL,                 -- 연락처
    email VARCHAR(100),                         -- 이메일
    address TEXT NOT NULL,                      -- 주소
    naver_store_url TEXT,                       -- 네이버 가게 URL
    plan_type VARCHAR(20) DEFAULT 'mobile',     -- 서비스 플랜 (mobile/integrated)
    device_count INTEGER DEFAULT 0,            -- 스마트 디바이스 수량
    status VARCHAR(20) DEFAULT 'active',        -- 매장 상태
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 매장별 메뉴 테이블
CREATE TABLE IF NOT EXISTS menus (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    menu_id VARCHAR(50) NOT NULL,              -- 메뉴 고유 ID (예: pasta_01)
    name VARCHAR(100) NOT NULL,                -- 메뉴명
    price INTEGER NOT NULL,                    -- 가격
    description TEXT,                          -- 설명
    category VARCHAR(50) DEFAULT 'main',       -- 카테고리 (main, drink, dessert 등)
    allergens TEXT,                           -- 알레르기 정보 (JSON 배열)
    image_url TEXT,                           -- 메뉴 이미지 URL
    is_available BOOLEAN DEFAULT true,         -- 판매 가능 여부
    display_order INTEGER DEFAULT 0,          -- 표시 순서
    naver_menu_id VARCHAR(100),               -- 네이버 메뉴 ID (원본 추적용)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, menu_id)
);

-- 매장별 테이블 설정
CREATE TABLE IF NOT EXISTS store_tables (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    table_name VARCHAR(50),                   -- 테이블명 (선택사항)
    capacity INTEGER DEFAULT 4,              -- 수용 인원
    is_active BOOLEAN DEFAULT true,          -- 사용 가능 여부
    position_x INTEGER,                      -- 매장 내 위치 X좌표
    position_y INTEGER,                      -- 매장 내 위치 Y좌표
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, table_number)
);

-- 인증 토큰 테이블 (QR 코드용)
CREATE TABLE IF NOT EXISTS qr_tokens (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES store_tables(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 주문 내역 테이블
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES store_tables(id) ON DELETE CASCADE,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'ordered',     -- ordered, preparing, served, completed
    payment_method VARCHAR(20),              -- mobile, card
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed
    customer_count INTEGER,
    notes TEXT,                              -- 특별 요청사항
    ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    served_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- 주문 상세 항목 테이블
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    menu_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,
    menu_name VARCHAR(100) NOT NULL,         -- 주문 당시 메뉴명 (기록용)
    unit_price INTEGER NOT NULL,            -- 주문 당시 가격
    quantity INTEGER NOT NULL,
    subtotal INTEGER NOT NULL,               -- unit_price * quantity
    special_requests TEXT                    -- 개별 요청사항
);

-- 채팅 세션 로그 테이블 (선택사항)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES store_tables(id) ON DELETE CASCADE,
    session_key VARCHAR(100) NOT NULL,
    message_count INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_stores_business_number ON stores(business_number);
CREATE INDEX IF NOT EXISTS idx_menus_store_id ON menus(store_id);
CREATE INDEX IF NOT EXISTS idx_menus_category ON menus(category);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_token ON qr_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_expires_at ON qr_tokens(expires_at);

-- 초기 테스트 데이터 (MVP용)
INSERT INTO stores (business_number, store_name, owner_name, phone, address, plan_type) 
VALUES ('123-45-67890', 'Burnana 테스트 매장', '김테스트', '010-1234-5678', '서울시 강남구 테스트로 123', 'mobile')
ON CONFLICT (business_number) DO NOTHING;

-- 테스트 매장의 기본 테이블 설정 (8개)
INSERT INTO store_tables (store_id, table_number, capacity) 
SELECT 1, generate_series(1, 8), 4
ON CONFLICT (store_id, table_number) DO NOTHING;

-- 기본 메뉴 데이터
INSERT INTO menus (store_id, menu_id, name, price, description, category) 
VALUES 
    (1, 'pasta_01', '토마토 파스타', 12000, '신선한 토마토와 바질로 만든 파스타', 'main'),
    (1, 'pizza_01', '마르게리타 피자', 18000, '모짜렐라 치즈와 바질의 클래식 피자', 'main'),
    (1, 'drink_01', '콜라', 3000, '시원한 탄산음료', 'drink'),
    (1, 'drink_02', '생수', 2000, '깔끔한 생수', 'drink')
ON CONFLICT (store_id, menu_id) DO NOTHING;