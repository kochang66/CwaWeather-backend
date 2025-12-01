require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// 步驟一：定義城市 Slug 與 CWA 中文名稱的映射表
const CWA_CITY_MAP = {
    'taipei': '臺北市', 'newtaipei': '新北市', 'taoyuan': '桃園市', 
    'taichung': '臺中市', 'tainan': '臺南市', 'kaohsiung': '高雄市',
    'keelung': '基隆市', 'hsinchu': '新竹市', 'hsinchucounty': '新竹縣', 
    'miaoli': '苗栗縣', 'changhua': '彰化縣', 'nantou': '南投縣',
    'yunlin': '雲林縣', 'chiayi': '嘉義市', 'chiayicounty': '嘉義縣', 
    'pingtung': '屏東縣', 'yilan': '宜蘭縣', 'hualien': '花蓮縣',
    'taitung': '臺東縣', 'penghu': '澎湖縣', 'kinmen': '金門縣', 
    'lianjiang': '連江縣'
};


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定城市的天氣預報
 * @param {string} cityName - CWA 要求的中文城市名稱
 */
const getWeatherByCity = async (cityName, res) => {
    try {
        // 檢查是否有設定 API Key
        if (!CWA_API_KEY) {
            return res.status(500).json({
                error: "伺服器設定錯誤",
                message: "請在 .env 檔案中設定 CWA_API_KEY",
            });
        }

        // 呼叫 CWA API - 一般天氣預報（36小時）
        const response = await axios.get(
            `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
            {
                params: {
                    Authorization: CWA_API_KEY,
                    locationName: cityName, // *** 關鍵：使用傳入的城市名稱 ***
                },
            }
        );

        // 取得城市的天氣資料
        // 注意：CWA API 會回傳一個陣列，但通常只有一個匹配項
        const locationData = response.data.records.location[0]; 

        if (!locationData) {
            return res.status(404).json({
                error: "查無資料",
                message: `無法取得 ${cityName} 天氣資料，請確認城市名稱是否正確`,
            });
        }

        // 整理天氣資料 (此處邏輯與您原程式碼相同)
        const weatherData = {
            city: locationData.locationName,
            updateTime: response.data.records.datasetDescription,
            forecasts: [],
        };

        const weatherElements = locationData.weatherElement;
        const timeCount = weatherElements[0].time.length;

        for (let i = 0; i < timeCount; i++) {
            const forecast = {
                startTime: weatherElements[0].time[i].startTime,
                endTime: weatherElements[0].time[i].endTime,
                weather: "",
                rain: "",
                minTemp: "",
                maxTemp: "",
                comfort: "",
                windSpeed: "",
            };

            weatherElements.forEach((element) => {
                const value = element.time[i].parameter;
                switch (element.elementName) {
                    case "Wx":
                        forecast.weather = value.parameterName;
                        break;
                    case "PoP":
                        // 確保百分比符號只加一次
                        forecast.rain = value.parameterName + (value.parameterUnit === '百分比' ? '%' : ''); 
                        break;
                    case "MinT":
                        // 確保溫度符號只加一次
                        forecast.minTemp = value.parameterName + (value.parameterUnit === 'C' ? '°' : '');
                        break;
                    case "MaxT":
                        forecast.maxTemp = value.parameterName + (value.parameterUnit === 'C' ? '°' : '');
                        break;
                    case "CI":
                        forecast.comfort = value.parameterName;
                        break;
                    case "WS":
                        forecast.windSpeed = value.parameterName;
                        break;
                }
            });

            weatherData.forecasts.push(forecast);
        }

        res.json({
            success: true,
            data: weatherData,
        });

    } catch (error) {
        console.error("取得天氣資料失敗:", error.message);

        if (error.response) {
            return res.status(error.response.status).json({
                error: "CWA API 錯誤",
                message: error.response.data.message || `無法取得 ${cityName} 天氣資料`,
                details: error.response.data,
            });
        }

        res.status(500).json({
            error: "伺服器錯誤",
            message: "無法取得天氣資料，請稍後再試",
        });
    }
};

// --- 路由定義區 ---

app.get("/", (req, res) => {
    res.json({
        message: "歡迎使用 CWA 天氣預報 API",
        endpoints: {
            weather_by_city: "/api/weather/:citySlug", // 導向新的動態路由
            health: "/api/health",
        },
    });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 步驟二：建立新的動態路由 /api/weather/:citySlug
app.get("/api/weather/:citySlug", (req, res) => {
    const citySlug = req.params.citySlug.toLowerCase();
    const cwaCityName = CWA_CITY_MAP[citySlug];

    if (!cwaCityName) {
        return res.status(404).json({
            success: false,
            error: "無效的城市代碼",
            message: `前端傳送的城市代碼 (${citySlug}) 無效，後端不支援`,
        });
    }

    // 呼叫通用的資料抓取函式
    getWeatherByCity(cwaCityName, res);
});


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: "伺服器錯誤",
        message: err.message,
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: "找不到此路徑",
    });
});

app.listen(PORT, () => {
    console.log(`🚀 伺服器運行已運作`);
    console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});