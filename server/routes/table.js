// server/routes/table.js
const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const router = express.Router();

// QR 코드 생성
router.get('/qr/:tableId', async (req, res) => {
  const { tableId } = req.params;
  
  try {
    // 새로운 토큰 생성 (5분마다 갱신)
    const token = crypto.randomUUID();
    const timestamp = Date.now();
    
    // 토큰 저장 및 만료 처리
    global.qrTokens.set(token, {
      tableId,
      createdAt: timestamp,
      expiresAt: timestamp + 5 * 60 * 1000 // 5분
    });
    
    // QR 코드 URL 생성
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const orderUrl = `${baseUrl}/order?table=${tableId}&token=${token}`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(orderUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#667eea',
        light: '#ffffff'
      }
    });
    
    res.json({
      qrCode: qrCodeDataUrl,
      orderUrl,
      token,
      tableId,
      expiresIn: 300, // 5분
      createdAt: new Date(timestamp).toISOString()
    });

    console.log(`🔗 [테이블 ${tableId}] QR 코드 생성 완료`);
    
    // Socket.IO로 QR 생성 로그 전송 (대시보드에 표시)
    if (router.io) {
      router.io.emit('qrGenerated', {
        tableId,
        token,
        expiresIn: 300,
        timestamp: new Date(timestamp).toISOString(),
        message: `테이블 ${tableId} QR 코드가 생성되었습니다`
      });
    }
    
  } catch (error) {
    console.error('QR 코드 생성 실패:', error);
    res.status(500).json({ 
      error: 'QR 코드 생성에 실패했습니다',
      details: error.message 
    });
  }
});

// QR 토큰 검증
function validateQRToken(token) {
  const tokenData = global.qrTokens.get(token);
  if (!tokenData) return null;
  
  if (Date.now() > tokenData.expiresAt) {
    global.qrTokens.delete(token);
    return null;
  }
  
  return tokenData;
}

// 테이블 상태 업데이트
function updateTableState(tableId, updates) {
  const currentState = global.tableStates.get(tableId) || {
    id: tableId,
    status: 'empty',
    customers: 0,
    orders: [],
    totalAmount: 0,
    sessionStart: null,
    lastActivity: null
  };
  
  const newState = { 
    ...currentState, 
    ...updates,
    lastActivity: new Date().toISOString()
  };
  
  global.tableStates.set(tableId, newState);
  
  // Socket.IO로 실시간 업데이트 (app.js에서 전달받은 io 사용)
  if (router.io) {
    router.io.emit('tableStateChanged', { 
      tableId, 
      state: newState,
      timestamp: new Date().toISOString()
    });
  }
  
  console.log(`📊 [테이블 ${tableId}] 상태 변경: ${newState.status}`);
  
  return newState;
}

// 테이블 상태 조회
router.get('/status/:tableId', (req, res) => {
  const { tableId } = req.params;
  const tableState = global.tableStates.get(tableId) || {
    id: tableId,
    status: 'empty',
    customers: 0,
    orders: [],
    totalAmount: 0,
    sessionStart: null,
    lastActivity: null
  };
  
  res.json(tableState);
});

// 전체 테이블 상태 조회
router.get('/status', (req, res) => {
  const tablesObject = {};
  for (const [key, value] of global.tableStates.entries()) {
    tablesObject[key] = value;
  }
  res.json(tablesObject);
});

// 장바구니 조회
router.get('/:tableId/cart', (req, res) => {
  const { tableId } = req.params;
  const tableState = global.tableStates.get(tableId) || { 
    orders: [], 
    totalAmount: 0 
  };
  
  res.json({
    tableId,
    cart: tableState.orders,
    totalAmount: tableState.totalAmount,
    itemCount: tableState.orders.reduce((sum, item) => sum + item.quantity, 0),
    lastUpdated: tableState.lastActivity
  });
});

// 테이블 서빙 완료
router.post('/served', (req, res) => {
  const { tableId } = req.body;
  
  if (!tableId) {
    return res.status(400).json({ error: '테이블 ID가 필요합니다' });
  }
  
  try {
    const updatedState = updateTableState(tableId, {
      status: 'served',
      servedTime: new Date().toISOString()
    });
    
    console.log(`✅ [테이블 ${tableId}] 서빙 완료 처리`);
    
    res.json({ 
      success: true, 
      message: `테이블 ${tableId} 서빙이 완료되었습니다`,
      tableState: updatedState
    });
    
  } catch (error) {
    console.error('서빙 완료 처리 실패:', error);
    res.status(500).json({ 
      error: '서빙 완료 처리 중 오류가 발생했습니다',
      details: error.message 
    });
  }
});

// 테이블 정리
router.post('/clear', (req, res) => {
  const { tableId } = req.body;
  
  if (!tableId) {
    return res.status(400).json({ error: '테이블 ID가 필요합니다' });
  }
  
  try {
    // 테이블 상태 초기화
    const clearedState = updateTableState(tableId, {
      status: 'empty',
      customers: 0,
      orders: [],
      totalAmount: 0,
      sessionStart: null,
      orderTime: null,
      servedTime: null,
      lastActivity: new Date().toISOString()
    });

    // 채팅 세션도 정리
    if (global.chatSessions) {
      delete global.chatSessions[`chat_${tableId}`];
      console.log(`💬 [테이블 ${tableId}] 채팅 세션 정리 완료`);
    }

    // 만료된 QR 토큰 정리 (해당 테이블)
    for (const [token, tokenData] of global.qrTokens.entries()) {
      if (tokenData.tableId === tableId) {
        global.qrTokens.delete(token);
      }
    }

    console.log(`🧹 [테이블 ${tableId}] 테이블 정리 완료`);
    
    res.json({ 
      success: true, 
      message: `테이블 ${tableId}가 정리되었습니다`,
      tableState: clearedState
    });
    
  } catch (error) {
    console.error('테이블 정리 실패:', error);
    res.status(500).json({ 
      error: '테이블 정리 중 오류가 발생했습니다',
      details: error.message 
    });
  }
});

// 테이블 고객 수 업데이트
router.post('/:tableId/customers', (req, res) => {
  const { tableId } = req.params;
  const { count } = req.body;
  
  if (!count || count < 0 || count > 20) {
    return res.status(400).json({ error: '유효하지 않은 고객 수입니다 (1-20명)' });
  }
  
  try {
    const updatedState = updateTableState(tableId, {
      customers: parseInt(count)
    });
    
    console.log(`👥 [테이블 ${tableId}] 고객 수 변경: ${count}명`);
    
    res.json({ 
      success: true, 
      message: `테이블 ${tableId} 고객 수가 ${count}명으로 업데이트되었습니다`,
      tableState: updatedState
    });
    
  } catch (error) {
    console.error('고객 수 업데이트 실패:', error);
    res.status(500).json({ 
      error: '고객 수 업데이트 중 오류가 발생했습니다',
      details: error.message 
    });
  }
});

// 시스템 정보 조회 (관리용)
router.get('/system/info', (req, res) => {
  const activeTokens = global.qrTokens.size;
  const activeTables = Array.from(global.tableStates.values())
    .filter(table => table.status !== 'empty').length;
  const totalSales = Array.from(global.tableStates.values())
    .reduce((sum, table) => sum + (table.totalAmount || 0), 0);
  
  res.json({
    system: {
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    },
    statistics: {
      activeTokens,
      activeTables,
      totalTables: global.tableStates.size,
      totalSales,
      activeChatSessions: Object.keys(global.chatSessions || {}).length
    },
    timestamps: {
      serverStart: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      lastActivity: new Date().toISOString()
    }
  });
});

// 만료된 QR 토큰 정리 (정기 실행)
function cleanupExpiredTokens() {
  let cleanedCount = 0;
  const now = Date.now();
  
  for (const [token, tokenData] of global.qrTokens.entries()) {
    if (now > tokenData.expiresAt) {
      global.qrTokens.delete(token);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🗑️ 만료된 QR 토큰 ${cleanedCount}개 정리 완료`);
  }
}

// 5분마다 만료된 토큰 정리
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

// 유틸리티 함수들 내보내기
module.exports = {
  router,
  validateQRToken,
  updateTableState,
  cleanupExpiredTokens
};