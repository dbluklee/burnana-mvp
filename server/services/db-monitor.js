const { Pool } = require('pg');

class DatabaseMonitor {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'burnana_dev',
      user: process.env.DB_USER || 'dev_user',
      password: process.env.DB_PASS || 'dev_password'
    });
    
    this.client = null;
    this.isListening = false;
    this.eventHandlers = new Map();
  }

  async connect() {
    try {
      this.client = await this.pool.connect();
      console.log('🔔 [DB 모니터] PostgreSQL 연결 성공');
      return true;
    } catch (error) {
      console.error('❌ [DB 모니터] PostgreSQL 연결 실패:', error.message);
      return false;
    }
  }

  async startListening() {
    if (!this.client || this.isListening) {
      return false;
    }

    try {
      // store_events 채널 구독
      await this.client.query('LISTEN store_events');
      this.isListening = true;
      
      console.log('🔔 [DB 모니터] store_events 채널 구독 시작');
      
      // 알림 수신 처리
      this.client.on('notification', (msg) => {
        this.handleNotification(msg);
      });
      
      return true;
    } catch (error) {
      console.error('❌ [DB 모니터] 채널 구독 실패:', error.message);
      return false;
    }
  }

  handleNotification(msg) {
    try {
      const data = JSON.parse(msg.payload);
      console.log('🔔 [DB 모니터] 새로운 이벤트:', data);
      
      // 이벤트 타입별 처리
      switch (data.event) {
        case 'store_created':
          this.handleStoreCreated(data);
          break;
        case 'store_updated':
          this.handleStoreUpdated(data);
          break;
        default:
          console.log('🔔 [DB 모니터] 알 수 없는 이벤트:', data.event);
      }
      
      // 등록된 이벤트 핸들러 호출
      if (this.eventHandlers.has(data.event)) {
        this.eventHandlers.get(data.event).forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            console.error('❌ [DB 모니터] 이벤트 핸들러 오류:', error.message);
          }
        });
      }
      
    } catch (error) {
      console.error('❌ [DB 모니터] 알림 처리 오류:', error.message);
    }
  }

  handleStoreCreated(data) {
    const timestamp = new Date().toLocaleString('ko-KR');
    console.log(`🎉 [${timestamp}] 새로운 매장 등록!`);
    console.log(`   매장명: ${data.store_name}`);
    console.log(`   사업자번호: ${data.business_number}`);
    console.log(`   매장 ID: ${data.store_id}`);
    
    // 여기에 추가 알림 로직 구현 가능
    // - 이메일 발송
    // - Slack 알림
    // - 푸시 알림
    // - 대시보드 업데이트
  }

  handleStoreUpdated(data) {
    const timestamp = new Date().toLocaleString('ko-KR');
    console.log(`📝 [${timestamp}] 매장 정보 업데이트!`);
    console.log(`   매장명: ${data.store_name}`);
    console.log(`   사업자번호: ${data.business_number}`);
    console.log(`   매장 ID: ${data.store_id}`);
  }

  // 이벤트 핸들러 등록
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  // 이벤트 핸들러 제거
  off(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async stop() {
    if (this.client && this.isListening) {
      try {
        await this.client.query('UNLISTEN store_events');
        this.isListening = false;
        console.log('🔔 [DB 모니터] 채널 구독 중지');
      } catch (error) {
        console.error('❌ [DB 모니터] 채널 구독 중지 실패:', error.message);
      }
    }
    
    if (this.client) {
      this.client.release();
      this.client = null;
    }
  }

  async getRecentEvents(limit = 10) {
    try {
      const query = `
        SELECT * FROM store_event_logs 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      const result = await this.pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('❌ [DB 모니터] 최근 이벤트 조회 실패:', error.message);
      return [];
    }
  }

  async getStoreStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_stores,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as new_stores_24h,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_stores_7d
        FROM stores
      `;
      const result = await this.pool.query(query);
      return result.rows[0];
    } catch (error) {
      console.error('❌ [DB 모니터] 매장 통계 조회 실패:', error.message);
      return null;
    }
  }
}

// 싱글톤 인스턴스
const dbMonitor = new DatabaseMonitor();

module.exports = dbMonitor;
