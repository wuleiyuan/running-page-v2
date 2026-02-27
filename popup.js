function formatSymbol(code) {
  code = code.trim();
  if (code.startsWith('sh') || code.startsWith('sz')) return code;
  if (/^6/.test(code)) return 'sh' + code;
  if (/^[03]/.test(code)) return 'sz' + code;
  return code;
}

async function search() {
  const code = document.getElementById('symbol').value;
  if (!code) return;

  const symbol = formatSymbol(code);
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = '<p>🔍 查询中...</p>';

  try {
    const res = await fetch('http://hq.sinajs.cn/list=' + symbol);
    if (!res.ok) throw new Error('网络错误: ' + res.status);
    
    const text = await res.text();
    const data = text.split('"')[1].split(',');
    
    if (!data[0] || data.length < 9) throw new Error('无效股票代码');

    const name = data[0];
    const price = parseFloat(data[3]);
    const lastClose = parseFloat(data[2]);
    const change = price - lastClose;
    const pct = (change / lastClose * 100).toFixed(2);
    const cls = change >= 0 ? 'up' : 'down';
    const sign = change >= 0 ? '+' : '';

    resultDiv.innerHTML = `
      <h4>${name} (${symbol})</h4>
      <p>当前价: <span class="${cls}">${price} (${sign}${change.toFixed(2)} ${sign}${pct}%)</span></p>
      <p>最高: ${data[4]} | 最低: ${data[5]}</p>
      <p>成交量: ${parseInt(data[8]).toLocaleString()}</p>
    `;
  } catch (err) {
    console.error('查询失败:', err);
    resultDiv.innerHTML = `<p style="color:#d32f2f">❌ 错误: ${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search').onclick = search;
  document.getElementById('symbol').onkeypress = (e) => {
    if (e.key === 'Enter') search();
  };
});
