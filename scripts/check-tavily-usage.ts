async function checkUsage() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.error('No TAVILY_API_KEY found in env');
    return;
  }
  const res = await fetch('https://api.tavily.com/usage', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Response JSON:', JSON.stringify(data, null, 2));
}

checkUsage();
