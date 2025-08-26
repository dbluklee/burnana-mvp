// server/ai/order-assistant.js
const axios = require('axios');

class OllamaClient {
  constructor(baseUrl = process.env.OLLAMA_HOST || '112.148.37.41:1884') {
    this.baseUrl = `http://${baseUrl}`;
    this.model = 'gemma3:27b-it-q4_K_M';
  }

  async chat(messages, tools = []) {
    try {
      // Gemma3 모델용 프롬프트 구성
      const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
      const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
      const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
      
      let prompt = systemPrompt;
      if (assistantMessages) prompt += `\n\nAssistant: ${assistantMessages}`;
      if (userMessages) prompt += `\n\nUser: ${userMessages}\n\nAssistant:`;

      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9
        }
      });

      // Tool calling 시뮬레이션 (실제 tool calling 대신 키워드 매칭)
      const aiResponse = response.data.response;
      const toolCalls = this.parseToolCalls(aiResponse);

      return {
        content: aiResponse,
        tool_calls: toolCalls
      };

    } catch (error) {
      console.error('Ollama API 오류:', error.message);
      throw new Error(`AI 서버 연결 실패: ${error.message}`);
    }
  }

  // 간단한 도구 호출 파싱 (키워드 기반)
  parseToolCalls(response) {
    const tools = [];
    
    // 메뉴 보기 요청
    if (response.match(/메뉴|menu|보여/i)) {
      tools.push({
        function: {
          name: 'show_menu',
          arguments: {}
        }
      });
    }
    
    // 주문 추가 요청 (정규식으로 메뉴명과 수량 파싱)
    const orderMatches = response.match(/(파스타|피자|콜라|음료)\s*(\d*)\s*개?/gi);
    if (orderMatches) {
      orderMatches.forEach(match => {
        const [, item, qty] = match.match(/(파스타|피자|콜라|음료)\s*(\d*)\s*개?/i) || [];
        const quantity = parseInt(qty) || 1;
        
        let menuId = 'pasta_01';
        if (item.includes('피자')) menuId = 'pizza_01';
        if (item.includes('콜라') || item.includes('음료')) menuId = 'drink_01';
        
        tools.push({
          function: {
            name: 'add_to_cart',
            arguments: { menu_id: menuId, quantity }
          }
        });
      });
    }
    
    // 장바구니 확인 요청
    if (response.match(/장바구니|카트|cart|확인/i)) {
      tools.push({
        function: {
          name: 'get_cart',
          arguments: {}
        }
      });
    }
    
    // 주문 완료 요청
    if (response.match(/주문.*완료|결제|order.*complete/i)) {
      tools.push({
        function: {
          name: 'complete_order',
          arguments: {}
        }
      });
    }
    
    return tools;
  }
}

// 메뉴 데이터 (MVP용 하드코딩)
const MENU = {
  pasta: {
    id: 'pasta_01',
    name: '토마토 파스타',
    price: 12000,
    description: '신선한 토마토와 바질로 만든 파스타',
    category: 'main',
    allergens: ['글루텐']
  },
  pizza: {
    id: 'pizza_01', 
    name: '마르게리타 피자',
    price: 18000,
    description: '모짜렐라 치즈와 바질의 클래식 피자',
    category: 'main',
    allergens: ['글루텐', '유제품']
  },
  cola: {
    id: 'drink_01',
    name: '콜라',
    price: 3000,
    description: '시원한 탄산음료',
    category: 'drink',
    allergens: []
  },
  water: {
    id: 'drink_02',
    name: '생수',
    price: 2000,
    description: '깔끔한 생수',
    category: 'drink',
    allergens: []
  }
};

// 도구 실행 함수들
const toolHandlers = {
  add_to_cart: (args, tableId) => {
    const { menu_id, quantity } = args;
    
    // 메뉴 찾기
    const menuKey = Object.keys(MENU).find(key => MENU[key].id === menu_id);
    const menu = MENU[menuKey];
    
    if (!menu) {
      return { error: '죄송합니다. 해당 메뉴를 찾을 수 없습니다.' };
    }

    const tableState = global.tableStates.get(tableId) || { orders: [], totalAmount: 0 };
    const existingOrder = tableState.orders.find(o => o.menuId === menu_id);
    
    if (existingOrder) {
      existingOrder.quantity += quantity;
    } else {
      tableState.orders.push({
        menuId: menu_id,
        name: menu.name,
        price: menu.price,
        quantity,
        category: menu.category
      });
    }

    // 총액 계산
    tableState.totalAmount = tableState.orders.reduce(
      (sum, order) => sum + (order.price * order.quantity), 0
    );

    // 테이블 상태 업데이트
    const currentTableState = global.tableStates.get(tableId) || {};
    global.tableStates.set(tableId, { 
      ...currentTableState, 
      ...tableState,
      status: 'ordering'
    });
    
    return {
      success: true,
      message: `${menu.name} ${quantity}개를 장바구니에 추가했습니다! 🛒`,
      cart: tableState.orders,
      totalAmount: tableState.totalAmount
    };
  },

  show_menu: () => {
    const menuList = Object.values(MENU).map(item => 
      `🍽️ **${item.name}** - ${item.price.toLocaleString()}원\n   ${item.description}`
    ).join('\n\n');

    return {
      success: true,
      message: `📋 **Burnana 메뉴판**\n\n${menuList}\n\n💬 원하시는 메뉴를 말씀해주세요!`,
      menu: Object.values(MENU)
    };
  },

  get_cart: (args, tableId) => {
    const tableState = global.tableStates.get(tableId) || { orders: [], totalAmount: 0 };
    
    if (tableState.orders.length === 0) {
      return {
        message: '🛒 장바구니가 비어있습니다.\n메뉴를 주문해보세요!',
        cart: [],
        totalAmount: 0
      };
    }

    const cartText = tableState.orders.map(item => 
      `• ${item.name} x${item.quantity} = ${(item.price * item.quantity).toLocaleString()}원`
    ).join('\n');

    return {
      success: true,
      message: `🛒 **현재 주문 내역**\n\n${cartText}\n\n💰 **총 금액: ${tableState.totalAmount.toLocaleString()}원**`,
      cart: tableState.orders,
      totalAmount: tableState.totalAmount
    };
  },

  complete_order: (args, tableId) => {
    const tableState = global.tableStates.get(tableId);
    if (!tableState || tableState.orders.length === 0) {
      return { 
        error: '주문할 메뉴가 없습니다. 먼저 메뉴를 선택해주세요! 😊' 
      };
    }

    // 주문 상태 업데이트
    global.tableStates.set(tableId, {
      ...tableState,
      status: 'ordered',
      orderTime: new Date().toISOString()
    });

    // 주방에 주문 전송 (콘솔 로그)
    console.log(`\n🍳 === 주방 주문서 출력 ===`);
    console.log(`📍 테이블: ${tableId}`);
    console.log(`⏰ 주문시간: ${new Date().toLocaleString()}`);
    console.log(`📋 주문내역:`);
    tableState.orders.forEach(order => {
      console.log(`   • ${order.name} x${order.quantity} (${order.price.toLocaleString()}원)`);
    });
    console.log(`💰 총액: ${tableState.totalAmount.toLocaleString()}원`);
    console.log(`========================\n`);

    const orderId = `ORDER_${tableId}_${Date.now()}`;
    
    return {
      success: true,
      message: `✅ **주문이 완료되었습니다!**\n\n📝 주문번호: ${orderId}\n🍳 주방에서 조리를 시작합니다.\n⏱️ 예상 조리시간: 15-20분\n\n맛있게 준비해드리겠습니다! 😊`,
      orderId,
      estimatedTime: '15-20분'
    };
  }
};

// 기본 AI 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 Burnana 레스토랑의 친근하고 전문적인 AI 주문 도우미입니다.

🎯 **당신의 역할:**
- 고객의 주문을 도와주는 친근한 서비스 직원
- 메뉴 추천 및 상세 설명 제공
- 정확하고 효율적인 주문 처리

📋 **현재 메뉴:**
• 토마토 파스타 - 12,000원 (신선한 토마토와 바질)
• 마르게리타 피자 - 18,000원 (모짜렐라 치즈와 바질)
• 콜라 - 3,000원 (시원한 탄산음료)
• 생수 - 2,000원 (깔끔한 생수)

💡 **응답 가이드:**
- 친근하고 정중한 말투 사용
- 이모지를 적절히 활용하여 친근감 표현
- 주문 시 수량과 메뉴명을 명확히 확인
- 알레르기나 특별 요청사항도 체크

🚫 **주의사항:**
- 메뉴에 없는 음식은 주문받을 수 없음
- 가격 정보는 정확히 안내
- 궁금한 점이 있으면 언제든 물어보라고 안내`;

module.exports = { 
  OllamaClient, 
  toolHandlers, 
  MENU, 
  SYSTEM_PROMPT 
};