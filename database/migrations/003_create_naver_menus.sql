-- database/migrations/003_create_naver_menus.sql
-- 네이버 메뉴 정보 테이블 생성

-- 1. 네이버 메뉴 테이블 생성
CREATE TABLE IF NOT EXISTS naver_menus (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    naver_store_id VARCHAR(20) NOT NULL,
    menu_name VARCHAR(200) NOT NULL,
    menu_price INTEGER,
    menu_description TEXT,
    menu_category VARCHAR(100),
    menu_image_url TEXT,
    menu_rating DECIMAL(3,2),
    menu_review_count INTEGER DEFAULT 0,
    is_popular BOOLEAN DEFAULT false,
    is_signature BOOLEAN DEFAULT false,
    naver_menu_id VARCHAR(100),
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, naver_store_id, menu_name)
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_naver_menus_store_id ON naver_menus(store_id);
CREATE INDEX IF NOT EXISTS idx_naver_menus_naver_store_id ON naver_menus(naver_store_id);
CREATE INDEX IF NOT EXISTS idx_naver_menus_category ON naver_menus(menu_category);
CREATE INDEX IF NOT EXISTS idx_naver_menus_scraped_at ON naver_menus(scraped_at);

-- 3. 메뉴 통계 테이블 생성
CREATE TABLE IF NOT EXISTS naver_menu_stats (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    naver_store_id VARCHAR(20) NOT NULL,
    total_menus INTEGER DEFAULT 0,
    avg_price DECIMAL(10,2),
    min_price INTEGER,
    max_price INTEGER,
    popular_menu_count INTEGER DEFAULT 0,
    signature_menu_count INTEGER DEFAULT 0,
    last_scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scraped_success BOOLEAN DEFAULT false,
    error_message TEXT,
    UNIQUE(store_id, naver_store_id)
);

-- 4. 메뉴 스크래핑 로그 테이블 생성
CREATE TABLE IF NOT EXISTS naver_scraping_logs (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    naver_store_id VARCHAR(20) NOT NULL,
    scraping_type VARCHAR(50) DEFAULT 'menu', -- 'menu', 'info', 'review'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'success', 'failed'
    menu_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    processing_time_ms INTEGER
);

-- 5. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_naver_menu_stats_store_id ON naver_menu_stats(store_id);
CREATE INDEX IF NOT EXISTS idx_naver_menu_stats_naver_store_id ON naver_menu_stats(naver_store_id);
CREATE INDEX IF NOT EXISTS idx_naver_scraping_logs_store_id ON naver_scraping_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_naver_scraping_logs_status ON naver_scraping_logs(status);
CREATE INDEX IF NOT EXISTS idx_naver_scraping_logs_started_at ON naver_scraping_logs(started_at);
