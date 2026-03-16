
const fetch = require('node-fetch');

async function testAuthAndChat() {
    const baseUrl = 'http://localhost:8082';
    const testUser = {
        username: 'testuser_' + Date.now(),
        email: 'test' + Date.now() + '@example.com',
        password: 'password123'
    };

    console.log('--- Testing Signup ---');
    const signupResp = await fetch(baseUrl + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
    });
    const signupData = await signupResp.json();
    console.log('Signup Status:', signupResp.status);
    console.log('Signup Result:', signupData);

    if (!signupResp.ok) return;

    console.log('\n--- Testing Login ---');
    const loginResp = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testUser.username, password: testUser.password })
    });
    const loginData = await loginResp.json();
    console.log('Login Status:', loginResp.status);
    console.log('Login Token:', loginData.token ? 'YES' : 'NO');

    if (!loginResp.ok) return;

    console.log('\n--- Testing Chat (Guest) ---');
    const chatResp = await fetch(baseUrl + '/api/gravity/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello as guest' })
    });
    const chatData = await chatResp.json();
    console.log('Chat Status:', chatResp.status);
    console.log('Chat Reply:', chatData.reply);
}

testAuthAndChat();
