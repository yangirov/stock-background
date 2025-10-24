const dotenv = require("dotenv");
const fs = require("fs");
const { createCanvas } = require("canvas");
const { TinkoffInvestApi } = require("tinkoff-invest-api");

dotenv.config();

const WIDTH = 1280;
const HEIGHT = 720;
const OUTPUT_FILE = "./background.png";

// Переменные окружения
const HISTORY_TIME = process.env.HISTORY_TIME || "-1h";
const TICKER = process.env.TICKER || 'VKCO';
const CLASS_CODE = process.env.CLASS_CODE || 'TQBR';
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ Ошибка: TOKEN не установлен в переменных окружения");
  process.exit(1);
}

const api = new TinkoffInvestApi({ token: TOKEN });

// Интервал сделоктщ
const CANDLE_REQUEST = {
  interval: 7,
  limit: 250,
  ...api.helpers.fromTo(HISTORY_TIME),
};

async function getCandles(uid) {
  const { candles } = await api.marketdata.getCandles({
    instrumentId: uid,
    ...CANDLE_REQUEST,
  });

  if (!candles?.length) {
    throw new Error("No candles");
  }

  return candles.map((c) => ({
    time: new Date(c.time),
    close: api.helpers.toNumber(c.close),
  }));
}

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

async function createChart() {
  const { instrument } = await api.instruments.getInstrumentBy({
    id: TICKER,
    idType: 2,
    classCode: CLASS_CODE
  }); 

  const data = await getCandles(instrument.uid);
  const closes = data.map((d) => d.close);
  const times = data.map((d) => d.time.getTime());
  const minPrice = Math.min(...closes);
  const maxPrice = Math.max(...closes);
  const avgPrice = closes.reduce((sum, v) => sum + v, 0) / closes.length;
  const firstPrice = closes[0];
  const lastPrice = closes[closes.length - 1];
  const diff = lastPrice - firstPrice;
  const percent = (diff / firstPrice) * 100;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const chartX = 40;
  const chartY = 80;
  const chartWidth = WIDTH - chartX - 80;
  const chartHeight = HEIGHT - chartY - 60;

  const xMin = Math.min(...times);
  const xMax = Math.max(...times);
  function getX(time) {
    return chartX + ((time - xMin) / (xMax - xMin)) * chartWidth;
  }
  function getY(price) {
    return chartY + ((maxPrice - price) / (maxPrice - minPrice)) * chartHeight;
  }

  // Линия графика
  ctx.beginPath();
  data.forEach((point, i) => {
    const x = getX(point.time.getTime());
    const y = getY(point.close);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Закрашиваем область под линией (градиент)
  ctx.lineTo(getX(times[times.length - 1]), chartY + chartHeight);
  ctx.lineTo(getX(times[0]), chartY + chartHeight);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
  gradient.addColorStop(0, "rgba(0,255,0,0.3)");
  gradient.addColorStop(1, "rgba(0,255,0,0)");
  ctx.fillStyle = gradient;
  ctx.fill();

  // Горизонтальные линии для min, avg, max
  ctx.strokeStyle = "#444444";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  [minPrice, avgPrice, maxPrice].forEach((price) => {
    ctx.beginPath();
    ctx.moveTo(chartX, getY(price));
    ctx.lineTo(chartX + chartWidth, getY(price));
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Подписи: мин/сред/макс справа
  ctx.fillStyle = "#cccccc";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(minPrice.toFixed(2), chartX + chartWidth + 10, getY(minPrice));
  ctx.fillText(avgPrice.toFixed(2), chartX + chartWidth + 10, getY(avgPrice));
  ctx.fillText(maxPrice.toFixed(2), chartX + chartWidth + 10, getY(maxPrice));

  // Подписи времени снизу (левый и правый край)
  ctx.textAlign = "center";
  ctx.fillText(formatTime(new Date(xMin)), chartX, chartY + chartHeight + 30);
  ctx.fillText(
    formatTime(new Date(xMax)),
    chartX + chartWidth,
    chartY + chartHeight + 30
  );

  // Стрелка и процент сверху
  const arrow = diff >= 0 ? "▲" : "▼";
  const arrowColor = diff >= 0 ? "#00ff00" : "#ff4444";
  ctx.fillStyle = arrowColor;
  ctx.textAlign = "left";
  ctx.font = "40px sans-serif";
  const ticker = instrument.ticker;
  const label = `${ticker}: ${lastPrice} ₽, ${arrow} ${Math.abs(diff).toFixed(
    2
  )} ₽ (${percent.toFixed(2)}%)`;
  ctx.fillText(label, chartX, chartY - 25);

  // Время в правом верхнем углу
  ctx.textAlign = "right";
  ctx.fillStyle = "#00ff00";
  ctx.font = "40px sans-serif";
  const now = new Date();
  ctx.fillText(formatTime(now), WIDTH - 90, 55);

  fs.writeFileSync(OUTPUT_FILE, canvas.toBuffer("image/png"));
}

async function updateBackground() {
  try {
    await createChart();
    console.log(`[${new Date().toLocaleTimeString()}] Chart saved to`, OUTPUT_FILE);
  } catch (e) {
    console.error(e);
  }
}

function msUntilNextMinute() {
  const now = new Date();
  return (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
}

function scheduleUpdates() {
  const delay = msUntilNextMinute();
  console.log(`⏳ Ждём ${delay} мс до начала следующей минуты...`);
  
  setTimeout(() => {
    updateBackground();

    setInterval(updateBackground, 60_000);
  }, delay);
}

scheduleUpdates();

async function gracefulShutdown() {
  console.log("Завершаем работу");
  process.exit();
}

process.on("SIGINT", gracefulShutdown);
