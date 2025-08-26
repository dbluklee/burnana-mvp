-- database/migrations/001_add_notifications.sql
-- 실시간 알림 기능 추가

-- 1. stores 테이블에 알림을 위한 트리거 함수 생성
CREATE OR REPLACE FUNCTION notify_store_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- 새로운 매장 등록 시 알림 전송
    PERFORM pg_notify(
        'store_events', 
        json_build_object(
            'event', 'store_created',
            'store_id', NEW.id,
            'store_name', NEW.store_name,
            'business_number', NEW.business_number,
            'created_at', NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. stores 테이블에 INSERT 트리거 추가
DROP TRIGGER IF EXISTS trigger_store_insert ON stores;
CREATE TRIGGER trigger_store_insert
    AFTER INSERT ON stores
    FOR EACH ROW
    EXECUTE FUNCTION notify_store_insert();

-- 3. stores 테이블에 UPDATE 트리거 함수 생성
CREATE OR REPLACE FUNCTION notify_store_update()
RETURNS TRIGGER AS $$
BEGIN
    -- 매장 정보 업데이트 시 알림 전송
    PERFORM pg_notify(
        'store_events', 
        json_build_object(
            'event', 'store_updated',
            'store_id', NEW.id,
            'store_name', NEW.store_name,
            'business_number', NEW.business_number,
            'updated_at', NEW.updated_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. stores 테이블에 UPDATE 트리거 추가
DROP TRIGGER IF EXISTS trigger_store_update ON stores;
CREATE TRIGGER trigger_store_update
    AFTER UPDATE ON stores
    FOR EACH ROW
    EXECUTE FUNCTION notify_store_update();

-- 5. 알림 이벤트 로그 테이블 생성
CREATE TABLE IF NOT EXISTS store_event_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'store_created', 'store_updated'
    store_id INTEGER REFERENCES stores(id),
    event_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. 알림 이벤트 로그를 위한 트리거 함수
CREATE OR REPLACE FUNCTION log_store_event()
RETURNS TRIGGER AS $$
BEGIN
    -- 이벤트 로그 테이블에 기록
    INSERT INTO store_event_logs (event_type, store_id, event_data)
    VALUES (
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'store_created'
            WHEN TG_OP = 'UPDATE' THEN 'store_updated'
        END,
        NEW.id,
        json_build_object(
            'store_name', NEW.store_name,
            'business_number', NEW.business_number,
            'owner_name', NEW.owner_name,
            'phone', NEW.phone,
            'plan_type', NEW.plan_type
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. stores 테이블에 로그 트리거 추가
DROP TRIGGER IF EXISTS trigger_store_log ON stores;
CREATE TRIGGER trigger_store_log
    AFTER INSERT OR UPDATE ON stores
    FOR EACH ROW
    EXECUTE FUNCTION log_store_event();

-- 8. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_store_event_logs_event_type ON store_event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_store_event_logs_created_at ON store_event_logs(created_at);
