// server/app.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// AI 어시스턴트 및 테이블 라우터 import
const { OllamaClient, toolHandlers, MENU, SYSTEM_PROMPT } = require('./ai/order-assistant');
const { router: tableRouter, validateQRToken, updateTableState } = require('./routes/table');
const authRouter = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 전역 변수들 (MVP용)
global.tableStates = new Map();
global.qrTokens = new Map();
global.chatSessions = {};

// Ollama 클라이언트 초기화
const ollamaClient = new OllamaClient();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Socket.IO를 테이블 라우터에서 사용할 수 있도록 설정
tableRouter.io = io;

// 라우터 등록
app.use('/api/table', tableRouter);
app.use('/api', authRouter);

// 가입 페이지
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/signup/index.html'));
});

// 기본 라우트
app.get('/', (req, res) => {
  res.json({
    message: 'Burnana MVP Server is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    ollama: process.env.OLLAMA_HOST || '112.148.37.41:1884',
    model: 'gemma3:27b-it-q4_K_M',
    features: [
      'AI 주문 시스템',
      '실시간 테이블 관리',
      'QR 코드 생성',
      '모바일 최적화'
    ]
  });
});

// 메뉴 API
app.get('/api/menu', (req, res) => {
  const menuArray = Object.values(MENU).map(item => ({
    id: item.id,
    name: item.name,
    price: `${item.price.toLocaleString()}원`,
    priceNumber: item.price,
    description: item.description,
    category: item.category,
    allergens: item.allergens || [],
    available: true
  }));
  
  res.json({
    menu: menuArray,
    categories: ['main', 'drink'],
    totalItems: menuArray.length,
    lastUpdated: new Date().toISOString()
  });
});

// AI 챗봇 API
app.post('/api/chat', async (req, res) => {
  const { message, tableId } = req.body;

  if (!message || !tableId) {
    return res.status(400).json({ 
      error: '메시지와 테이블 ID가 필요합니다.',
      received: { message: !!message, tableId: !!tableId }
    });
  }

  try {
    // 대화 기록 관리
    const sessionKey = `chat_${tableId}`;
    if (!global.chatSessions[sessionKey]) {
      global.chatSessions[sessionKey] = [
        { role: 'system', content: SYSTEM_PROMPT }
      ];
      console.log(`💬 [테이블 ${tableId}] 새로운 채팅 세션 시작`);
    }

    global.chatSessions[sessionKey].push({
      role: 'user',
      content: message
    });

    console.log(`👤 [테이블 ${tableId}] 고객: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

    // Ollama AI 호출
    const response = await ollamaClient.chat(global.chatSessions[sessionKey]);

    let finalResponse = response.content;
    let cartUpdated = false;
    let actionPerformed = null;

    // 도구 호출 처리
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 [테이블 ${tableId}] 도구 호출: ${response.tool_calls.length}개`);
      
      for (const toolCall of response.tool_calls) {
        const { name, arguments: args } = toolCall.function;
        
        if (toolHandlers[name]) {
          const result = toolHandlers[name](args, tableId);
          actionPerformed = name;
          
          if (result.success || result.menu || result.cart || result.message) {
            cartUpdated = true;
            finalResponse = result.message || finalResponse;
            
            // 특별한 액션에 대한 로깅
            if (name === 'complete_order') {
              console.log(`✅ [테이블 ${tableId}] 주문 완료 - 총 ${result.estimatedTime || '15-20분'} 예상`);
            }
          }
          
          if (result.error) {
            finalResponse = result.error;
            console.log(`❌ [테이블 ${tableId}] 도구 실행 오류: ${result.error}`);
          }
        }
      }
    }

    // AI 응답 추가
    global.chatSessions[sessionKey].push({
      role: 'assistant',
      content: finalResponse
    });

    console.log(`🤖 [테이블 ${tableId}] AI: ${finalResponse.substring(0, 100)}${finalResponse.length > 100 ? '...' : ''}`);

    // Socket.io로 실시간 업데이트
    io.emit('newMessage', { 
      tableId, 
      message, 
      response: finalResponse,
      actionPerformed,
      timestamp: new Date().toISOString()
    });

    res.json({
      response: finalResponse,
      cartUpdated,
      actionPerformed,
      sessionLength: global.chatSessions[sessionKey].length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ [테이블 ${tableId}] AI 챗봇 오류:`, error.message);
    res.status(500).json({
      response: '죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요. 😅',
      error: 'AI_SERVICE_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// 주문 완료 API
app.post('/api/order/complete', (req, res) => {
  const { tableId } = req.body;
  
  if (!tableId) {
    return res.status(400).json({ error: '테이블 ID가 필요합니다' });
  }
  
  try {
    const updatedState = updateTableState(tableId, {
      status: 'ordered',
      orderTime: new Date().toISOString()
    });
    
    console.log(`🎯 [테이블 ${tableId}] 직접 주문 완료 API 호출`);
    
    res.json({ 
      success: true,
      orderId: `ORDER_${tableId}_${Date.now()}`,
      tableState: updatedState,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('주문 완료 처리 실패:', error);
    res.status(500).json({ 
      error: '주문 완료 처리 중 오류가 발생했습니다',
      details: error.message 
    });
  }
});

// 고객용 주문 페이지
app.get('/order', (req, res) => {
  const { table, token } = req.query;
  
  // 토큰 검증
  const tokenData = validateQRToken(token);
  if (!tokenData || tokenData.tableId !== table) {
    console.log(`🚫 잘못된 QR 접근 시도 - 테이블: ${table}, 토큰: ${token ? '존재' : '없음'}`);
    
    // Socket.IO로 실패한 접근 로그 전송
    io.emit('qrScanAttempt', {
      tableId: table,
      success: false,
      reason: 'invalid_token',
      timestamp: new Date().toISOString(),
      message: `테이블 ${table} QR 스캔 실패 (유효하지 않은 토큰)`
    });
    
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>접근 오류 - Burnana</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background: linear-gradient(135deg, #667eea, #764ba2);
              color: white;
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .error-container {
              background: white;
              color: #333;
              padding: 40px;
              border-radius: 16px;
              max-width: 400px;
              box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            }
            .error-icon { font-size: 64px; margin-bottom: 20px; }
            .error-title { font-size: 24px; font-weight: bold; margin-bottom: 16px; }
            .error-desc { color: #666; line-height: 1.5; }
          </style>
      </head>
      <body>
          <div class="error-container">
            <div class="error-icon">⚠️</div>
            <div class="error-title">접근이 제한되었습니다</div>
            <div class="error-desc">
              올바른 QR 코드를 스캔해주세요.<br><br>
              QR 코드가 만료되었거나 유효하지 않습니다.<br>
              <small>(QR 코드는 5분간 유효합니다)</small>
            </div>
          </div>
      </body>
      </html>
    `);
  }

  // QR 스캔 성공! 
  console.log(`📱 [테이블 ${table}] QR 스캔 성공 - 고객이 주문 페이지에 접속했습니다`);
  
  // Socket.IO로 성공한 QR 스캔 실시간 전송
  io.emit('qrScanAttempt', {
    tableId: table,
    success: true,
    tokenAge: Math.floor((Date.now() - tokenData.createdAt) / 1000), // 토큰 생성 후 몇 초 경과
    timestamp: new Date().toISOString(),
    message: `테이블 ${table} QR 스캔 성공 - 고객이 접속했습니다`,
    userAgent: req.get('User-Agent') || 'Unknown Device'
  });

  // 테이블 세션 시작
  updateTableState(table, {
    status: 'occupied',
    sessionStart: new Date().toISOString(),
    customerDevice: req.get('User-Agent') || 'Unknown Device'
  });

  console.log(`📱 [테이블 ${table}] 모바일 주문 페이지 접속 - 토큰 유효`);

  // 새로운 모바일 페이지 제공
  res.sendFile(path.join(__dirname, '../client/mobile/index.html'));
});

// 점주용 대시보드
app.get('/dashboard', (req, res) => {
  console.log('📊 점주 대시보드 접속');
  res.sendFile(path.join(__dirname, '../client/dashboard/index.html'));
});

// 테스트용 간단한 AI 채팅 API
app.post('/api/chat/test', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: '메시지가 필요합니다' });
  }
  
  try {
    const response = await ollamaClient.chat([
      { role: 'system', content: '간단하게 답변해주세요.' },
      { role: 'user', content: message }
    ]);

    res.json({ 
      response: response.content,
      model: 'gemma3:27b-it-q4_K_M',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('AI 테스트 채팅 오류:', error);
    res.status(500).json({ 
      error: 'AI 서버 연결 실패',
      details: error.message 
    });
  }
});

// Socket.IO 연결 처리
io.on('connection', (socket) => {
  console.log('🔗 클라이언트 연결:', socket.id);

  // 연결된 클라이언트에게 현재 테이블 상태 전송
  socket.emit('initialTableStates', {
    tables: Object.fromEntries(global.tableStates),
    timestamp: new Date().toISOString()
  });

  socket.on('disconnect', () => {
    console.log('📴 클라이언트 연결 해제:', socket.id);
  });

  socket.on('requestTableUpdate', (tableId) => {
    const tableState = global.tableStates.get(tableId);
    if (tableState) {
      socket.emit('tableStateChanged', { 
        tableId, 
        state: tableState,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// 에러 핸들링
app.use((error, req, res, next) => {
  console.error('❌ 서버 오류:', error);
  res.status(500).json({ 
    error: '서버 내부 오류가 발생했습니다',
    timestamp: new Date().toISOString()
  });
});

// 404 처리
app.use((req, res) => {
  console.log(`🔍 404 - 페이지를 찾을 수 없음: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: '페이지를 찾을 수 없습니다',
    requestedUrl: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('\n🚀 Burnana MVP 서버 실행 중!');
  console.log(`📍 서버 주소: http://localhost:${PORT}`);
  console.log(`🤖 AI 서버: http://${process.env.OLLAMA_HOST || '112.148.37.41:1884'}`);
  console.log(`🧠 AI 모델: gemma3:27b-it-q4_K_M`);
  console.log('\n📱 테스트 URL:');
  console.log(`   홈페이지: http://localhost:${PORT}`);
  console.log(`   가입페이지: http://localhost:${PORT}/signup`);
  console.log(`   대시보드: http://localhost:${PORT}/dashboard`);
  console.log(`   QR 생성: http://localhost:${PORT}/api/table/qr/1`);
  console.log(`   메뉴 API: http://localhost:${PORT}/api/menu`);
  console.log(`   시스템 정보: http://localhost:${PORT}/api/table/system/info`);
  console.log('\n💬 AI 테스트:');
  console.log(`   POST http://localhost:${PORT}/api/chat/test`);
  console.log('   Body: {"message": "안녕하세요"}');
  console.log('\n🎯 QR 주문 테스트:');
  console.log('   1. QR 생성 → 2. 링크 클릭 → 3. "메뉴 보여줘" 입력');
  console.log('\n🔧 관리 기능:');
  console.log('   • 자동 토큰 정리: 5분마다');
  console.log('   • 실시간 Socket.IO 업데이트');
  console.log('   • 채팅 세션 관리');
  console.log('\n✨ MVP 준비 완료! 테스트를 시작하세요.');
});

// 정상 종료 처리
process.on('SIGTERM', () => {
  console.log('\n🛑 서버가 정상적으로 종료됩니다...');
  server.close(() => {
    console.log('✅ 서버 종료 완료');
    process.exit(0);
  });
});