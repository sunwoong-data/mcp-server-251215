import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { InferenceClient } from '@huggingface/inference'

// Smithery configSchema: 사용자 설정을 위한 스키마
export const configSchema = z.object({
    HF_TOKEN: z.string().optional().describe('Hugging Face API 토큰 (이미지 생성에 필요, 선택사항)')
})

// 설정 타입 정의
type Config = z.infer<typeof configSchema>

// Smithery 배포를 위한 createServer 함수
export default function createServer({ config }: { config: Config }) {
const server = new McpServer({
        name: 'mcp-server-251215',
    version: '1.0.0'
})

server.registerTool(
    'greet',
    {
        description: '이름과 언어를 입력하면 인사말을 반환합니다.',
        inputSchema: z.object({
            name: z.string().describe('인사할 사람의 이름'),
            language: z
                .enum(['ko', 'en'])
                .optional()
                .default('en')
                .describe('인사 언어 (기본값: en)')
        }),
        outputSchema: z.object({
            content: z
                .array(
                    z.object({
                        type: z.literal('text'),
                        text: z.string().describe('인사말')
                    })
                )
                .describe('인사말')
        })
    },
    async ({ name, language }) => {
        const greeting =
            language === 'ko'
                ? `안녕하세요, ${name}님!`
                : `Hey there, ${name}! 👋 Nice to meet you!`

        return {
            content: [
                {
                    type: 'text' as const,
                    text: greeting
                }
            ],
            structuredContent: {
                content: [
                    {
                        type: 'text' as const,
                        text: greeting
                    }
                ]
            }
        }
    }
)

    server.registerTool(
        'calculator',
        {
            description: '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
            inputSchema: z.object({
                number1: z.number().describe('첫 번째 숫자'),
                number2: z.number().describe('두 번째 숫자'),
                operator: z
                    .enum(['+', '-', '*', '/'])
                    .describe('연산자 (+, -, *, /)')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('계산 결과')
                        })
                    )
                    .describe('계산 결과')
            })
        },
        async ({ number1, number2, operator }) => {
            let result: number

            switch (operator) {
                case '+':
                    result = number1 + number2
                    break
                case '-':
                    result = number1 - number2
                    break
                case '*':
                    result = number1 * number2
                    break
                case '/':
                    if (number2 === 0) {
                        throw new Error('0으로 나눌 수 없습니다.')
                    }
                    result = number1 / number2
                    break
            }

            const resultText = `${number1} ${operator} ${number2} = ${result}`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: resultText
                    }
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ]
                }
            }
        }
    )

    server.registerTool(
        'time',
        {
            description: '특정 타임존의 현재 시간을 반환합니다.',
            inputSchema: z.object({
                timezone: z
                    .string()
                    .describe('IANA 타임존 이름 (예: Asia/Seoul, America/New_York, Europe/London)')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('현재 시간')
                        })
                    )
                    .describe('현재 시간')
            })
        },
        async ({ timezone }) => {
            try {
                const now = new Date()
                const formatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })

                const formattedTime = formatter.format(now)
                const resultText = `${timezone}의 현재 시간: ${formattedTime}`

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ],
                    structuredContent: {
                        content: [
                            {
                                type: 'text' as const,
                                text: resultText
                            }
                        ]
                    }
                }
            } catch (error) {
                throw new Error(`유효하지 않은 타임존입니다: ${timezone}`)
            }
        }
    )

    server.registerTool(
        'geocode',
        {
            description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
            inputSchema: z.object({
                query: z
                    .string()
                    .describe('검색할 도시 이름이나 주소 (예: "Seoul", "New York", "서울시 강남구")')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('위도와 경도 좌표 정보')
                        })
                    )
                    .describe('위도와 경도 좌표 정보')
            })
        },
        async ({ query }) => {
            try {
                // Nominatim API 엔드포인트
                const baseUrl = 'https://nominatim.openstreetmap.org/search'
                const params = new URLSearchParams({
                    q: query,
                    format: 'json',
                    limit: '1',
                    addressdetails: '1'
                })

                const url = `${baseUrl}?${params.toString()}`
                
                // User-Agent 헤더는 Nominatim 사용 정책에 따라 필수입니다
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'MCP-Geocode-Tool/1.0'
                    }
                })

                if (!response.ok) {
                    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`)
                }

                const data = await response.json()

                if (!data || data.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `"${query}"에 대한 검색 결과를 찾을 수 없습니다.`
                            }
                        ],
                        structuredContent: {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: `"${query}"에 대한 검색 결과를 찾을 수 없습니다.`
                                }
                            ]
                        }
                    }
                }

                const result = data[0]
                const lat = parseFloat(result.lat)
                const lon = parseFloat(result.lon)
                const displayName = result.display_name || query

                const resultText = `주소: ${displayName}\n위도: ${lat}\n경도: ${lon}\n좌표: (${lat}, ${lon})`

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ],
                    structuredContent: {
                        content: [
                            {
                                type: 'text' as const,
                                text: resultText
                            }
                        ]
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
                throw new Error(`지오코딩 실패: ${errorMessage}`)
            }
        }
    )

    server.registerTool(
        'get-weather',
        {
            description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다.',
            inputSchema: z.object({
                latitude: z.number().describe('위도 좌표 (WGS84)'),
                longitude: z.number().describe('경도 좌표 (WGS84)'),
                forecast_days: z
                    .number()
                    .int()
                    .min(1)
                    .max(16)
                    .optional()
                    .default(7)
                    .describe('예보 기간 (일 단위, 기본값: 7일, 최대: 16일)')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('날씨 정보')
                        })
                    )
                    .describe('날씨 정보')
            })
        },
        async ({ latitude, longitude, forecast_days = 7 }) => {
            try {
                // Open-Meteo API 엔드포인트
                const baseUrl = 'https://api.open-meteo.com/v1/forecast'
                const params = new URLSearchParams({
                    latitude: latitude.toString(),
                    longitude: longitude.toString(),
                    forecast_days: forecast_days.toString(),
                    hourly: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
                    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
                    timezone: 'auto'
                })

                const url = `${baseUrl}?${params.toString()}`
                const response = await fetch(url)

                if (!response.ok) {
                    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`)
                }

                const data = await response.json()

                if (data.error) {
                    throw new Error(data.reason || '알 수 없는 오류가 발생했습니다.')
                }

                // 날씨 코드를 텍스트로 변환하는 함수
                const getWeatherDescription = (code: number): string => {
                    const weatherCodes: Record<number, string> = {
                        0: '맑음',
                        1: '대체로 맑음',
                        2: '부분적으로 흐림',
                        3: '흐림',
                        45: '안개',
                        48: '서리 안개',
                        51: '약한 이슬비',
                        53: '중간 이슬비',
                        55: '강한 이슬비',
                        56: '약한 동결 이슬비',
                        57: '강한 동결 이슬비',
                        61: '약한 비',
                        63: '중간 비',
                        65: '강한 비',
                        66: '약한 동결 비',
                        67: '강한 동결 비',
                        71: '약한 눈',
                        73: '중간 눈',
                        75: '강한 눈',
                        77: '눈알갱이',
                        80: '약한 소나기',
                        81: '중간 소나기',
                        82: '강한 소나기',
                        85: '약한 눈 소나기',
                        86: '강한 눈 소나기',
                        95: '뇌우',
                        96: '우박을 동반한 뇌우',
                        99: '강한 우박을 동반한 뇌우'
                    }
                    return weatherCodes[code] || `날씨 코드: ${code}`
                }

                // 현재 날씨 정보 (hourly 데이터의 첫 번째 값 사용)
                const hourly = data.hourly
                const currentTime = hourly?.time?.[0] || '현재'
                const currentTemp = hourly?.temperature_2m?.[0]
                const currentHumidity = hourly?.relative_humidity_2m?.[0]
                const currentWindSpeed = hourly?.wind_speed_10m?.[0]
                const currentWeatherCode = hourly?.weather_code?.[0]

                // 현재 날씨 정보 포맷팅
                let resultText = `📍 위치: 위도 ${latitude}, 경도 ${longitude}\n`
                resultText += `⏰ 예보 기간: ${forecast_days}일\n\n`
                resultText += `🌤️ 현재 날씨 (${currentTime})\n`
                resultText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
                
                if (currentTemp !== undefined) {
                    resultText += `온도: ${currentTemp}°C\n`
                }
                if (currentHumidity !== undefined) {
                    resultText += `습도: ${currentHumidity}%\n`
                }
                if (currentWindSpeed !== undefined) {
                    resultText += `풍속: ${currentWindSpeed} km/h\n`
                }
                if (currentWeatherCode !== undefined) {
                    resultText += `날씨: ${getWeatherDescription(currentWeatherCode)}\n`
                }
                resultText += '\n'

                // 일별 예보 정보
                if (data.daily && data.daily.time) {
                    resultText += `📅 ${forecast_days}일 예보\n`
                    resultText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
                    
                    const daily = data.daily
                    const maxTemps = daily.temperature_2m_max || []
                    const minTemps = daily.temperature_2m_min || []
                    const precipitations = daily.precipitation_sum || []
                    const weatherCodes = daily.weather_code || []

                    for (let i = 0; i < Math.min(forecast_days, daily.time.length); i++) {
                        const date = new Date(daily.time[i])
                        const dateStr = date.toLocaleDateString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            weekday: 'short'
                        })
                        
                        resultText += `${dateStr}\n`
                        resultText += `  최고: ${maxTemps[i]}°C | 최저: ${minTemps[i]}°C\n`
                        resultText += `  강수량: ${precipitations[i]}mm\n`
                        resultText += `  날씨: ${getWeatherDescription(weatherCodes[i])}\n`
                        
                        if (i < Math.min(forecast_days, daily.time.length) - 1) {
                            resultText += '\n'
                        }
                    }
                }

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: resultText
                        }
                    ],
                    structuredContent: {
                        content: [
                            {
                                type: 'text' as const,
                                text: resultText
                            }
                        ]
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
                throw new Error(`날씨 정보 조회 실패: ${errorMessage}`)
            }
        }
    )

    server.registerTool(
        'generate-image',
        {
            description: '텍스트 프롬프트를 입력받아 AI로 이미지를 생성합니다.',
            inputSchema: z.object({
                prompt: z.string().describe('이미지를 생성할 텍스트 프롬프트')
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('image'),
                            data: z.string().describe('base64로 인코딩된 이미지 데이터'),
                            mimeType: z.string().describe('이미지 MIME 타입')
                        })
                    )
                    .describe('생성된 이미지')
            })
        },
        async ({ prompt }) => {
            try {
                // config에서 Hugging Face 토큰 가져오기
                const hfToken = config?.HF_TOKEN
                if (!hfToken) {
                    throw new Error('HF_TOKEN이 설정되지 않았습니다. 이미지 생성을 사용하려면 Hugging Face 토큰을 설정해주세요.')
                }

                // Inference Client 생성
                const client = new InferenceClient(hfToken)

                // 이미지 생성 (outputType을 명시적으로 "blob"으로 지정)
                const imageBlob = await client.textToImage(
                    {
                        provider: 'auto',
                        model: 'black-forest-labs/FLUX.1-schnell',
                        inputs: prompt,
                        parameters: { num_inference_steps: 5 }
                    },
                    { outputType: 'blob' }
                )

                // Blob을 ArrayBuffer로 변환
                const arrayBuffer = await imageBlob.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)

                // Base64로 인코딩
                const base64Image = buffer.toString('base64')

                return {
                    content: [
                        {
                            type: 'image' as const,
                            data: base64Image,
                            mimeType: 'image/png'
                        }
                    ],
                    structuredContent: {
                        content: [
                            {
                                type: 'image' as const,
                                data: base64Image,
                                mimeType: 'image/png'
                            }
                        ]
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
                throw new Error(`이미지 생성 실패: ${errorMessage}`)
            }
        }
    )

    // 서버 정보 및 도구 정보 리소스 등록
    server.registerResource(
        'server-info',
        'mcp://server-info',
        {
            title: '서버 정보',
            description: '현재 MCP 서버 정보 및 사용 가능한 도구 목록',
            mimeType: 'application/json'
        },
        async () => {
            // 서버 정보
            const serverInfo = {
                name: 'mcp-server-251215',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                tools: [
                    {
                        name: 'greet',
                        description: '이름과 언어를 입력하면 인사말을 반환합니다.',
                        parameters: {
                            name: {
                                type: 'string',
                                description: '인사할 사람의 이름'
                            },
                            language: {
                                type: 'string',
                                enum: ['ko', 'en'],
                                optional: true,
                                default: 'en',
                                description: '인사 언어 (기본값: en)'
                            }
                        }
                    },
                    {
                        name: 'calculator',
                        description: '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
                        parameters: {
                            number1: {
                                type: 'number',
                                description: '첫 번째 숫자'
                            },
                            number2: {
                                type: 'number',
                                description: '두 번째 숫자'
                            },
                            operator: {
                                type: 'string',
                                enum: ['+', '-', '*', '/'],
                                description: '연산자 (+, -, *, /)'
                            }
                        }
                    },
                    {
                        name: 'time',
                        description: '특정 타임존의 현재 시간을 반환합니다.',
                        parameters: {
                            timezone: {
                                type: 'string',
                                description: 'IANA 타임존 이름 (예: Asia/Seoul, America/New_York, Europe/London)'
                            }
                        }
                    },
                    {
                        name: 'geocode',
                        description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
                        parameters: {
                            query: {
                                type: 'string',
                                description: '검색할 도시 이름이나 주소 (예: "Seoul", "New York", "서울시 강남구")'
                            }
                        }
                    },
                    {
                        name: 'get-weather',
                        description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다.',
                        parameters: {
                            latitude: {
                                type: 'number',
                                description: '위도 좌표 (WGS84)'
                            },
                            longitude: {
                                type: 'number',
                                description: '경도 좌표 (WGS84)'
                            },
                            forecast_days: {
                                type: 'number',
                                optional: true,
                                default: 7,
                                min: 1,
                                max: 16,
                                description: '예보 기간 (일 단위, 기본값: 7일, 최대: 16일)'
                            }
                        }
                    },
                    {
                        name: 'generate-image',
                        description: '텍스트 프롬프트를 입력받아 AI로 이미지를 생성합니다.',
                        parameters: {
                            prompt: {
                                type: 'string',
                                description: '이미지를 생성할 텍스트 프롬프트'
                            }
                        }
                    }
                ],
                totalTools: 6
            }

            return {
                contents: [
                    {
                        uri: 'mcp://server-info',
                        mimeType: 'application/json',
                        text: JSON.stringify(serverInfo, null, 2)
                    }
                ]
            }
        }
    )

    // 코드 리뷰 프롬프트 템플릿
    const CODE_REVIEW_TEMPLATE = `다음 코드를 리뷰해주세요. 다음 항목들을 중점적으로 확인해주세요:

## 리뷰 체크리스트

### 1. 코드 품질
- [ ] 코드가 명확하고 읽기 쉬운가?
- [ ] 변수명과 함수명이 의미 있는가?
- [ ] 중복 코드가 있는가?
- [ ] 불필요한 주석이나 코드가 있는가?

### 2. 버그 및 잠재적 문제
- [ ] 잠재적인 버그나 예외 상황 처리가 되어 있는가?
- [ ] 에러 핸들링이 적절한가?
- [ ] 경계 조건(boundary conditions)이 올바르게 처리되었는가?

### 3. 성능
- [ ] 성능 최적화가 필요한 부분이 있는가?
- [ ] 불필요한 연산이나 반복이 있는가?

### 4. 보안
- [ ] 보안 취약점이 있는가?
- [ ] 입력값 검증이 적절한가?

### 5. 모범 사례
- [ ] 해당 언어/프레임워크의 모범 사례를 따르고 있는가?
- [ ] 코드 스타일이 일관성 있는가?

## 리뷰 요청 코드

\`\`\`
{code}
\`\`\`

위 코드에 대해 위 체크리스트를 기반으로 상세한 리뷰를 작성해주세요. 개선 사항이 있다면 구체적인 예시와 함께 제시해주세요.`

    // 코드 리뷰 프롬프트 등록
    server.registerPrompt(
        'code-review',
        {
            title: '코드 리뷰',
            description: '코드를 입력받아 미리 정의된 리뷰 템플릿과 결합하여 코드 리뷰 프롬프트를 생성합니다.',
            argsSchema: {
                code: z.string().describe('리뷰할 코드'),
                language: z
                    .string()
                    .optional()
                    .describe('코드 언어 (예: typescript, javascript, python 등) - 선택사항'),
                focus: z
                    .string()
                    .optional()
                    .describe('특별히 집중할 리뷰 영역 (예: 성능, 보안, 버그 등) - 선택사항')
            }
        },
        async ({ code, language, focus }) => {
            // 언어별 추가 가이드라인
            const languageGuidelines: Record<string, string> = {
                typescript: '\n### TypeScript 특화 체크리스트\n- [ ] 타입 정의가 적절한가?\n- [ ] any 타입 사용을 피했는가?\n- [ ] 제네릭을 적절히 활용했는가?',
                javascript: '\n### JavaScript 특화 체크리스트\n- [ ] ES6+ 문법을 적절히 사용했는가?\n- [ ] 비동기 처리가 올바른가?\n- [ ] 메모리 누수 가능성이 있는가?',
                python: '\n### Python 특화 체크리스트\n- [ ] PEP 8 스타일 가이드를 따르고 있는가?\n- [ ] 예외 처리가 적절한가?\n- [ ] 리스트 컴프리헨션을 적절히 활용했는가?',
                java: '\n### Java 특화 체크리스트\n- [ ] 네이밍 컨벤션을 따르고 있는가?\n- [ ] 예외 처리가 적절한가?\n- [ ] 불필요한 객체 생성이 없는가?'
            }

            // 집중 영역별 추가 가이드라인
            const focusGuidelines: Record<string, string> = {
                성능: '\n### 성능 집중 리뷰\n- [ ] 알고리즘 시간 복잡도가 최적인가?\n- [ ] 불필요한 데이터베이스 쿼리가 있는가?\n- [ ] 캐싱을 활용할 수 있는 부분이 있는가?',
                보안: '\n### 보안 집중 리뷰\n- [ ] SQL 인젝션 방지가 되어 있는가?\n- [ ] XSS 공격 방지가 되어 있는가?\n- [ ] 인증/인가 처리가 올바른가?\n- [ ] 민감한 정보가 노출되지 않는가?',
                버그: '\n### 버그 집중 리뷰\n- [ ] null/undefined 체크가 충분한가?\n- [ ] 배열 인덱스 범위 체크가 있는가?\n- [ ] 타입 변환 시 오류 가능성이 있는가?'
            }

            // 프롬프트 생성
            let prompt = CODE_REVIEW_TEMPLATE.replace('{code}', code)

            // 언어별 가이드라인 추가
            if (language && languageGuidelines[language.toLowerCase()]) {
                prompt += languageGuidelines[language.toLowerCase()]
            }

            // 집중 영역 가이드라인 추가
            if (focus && focusGuidelines[focus]) {
                prompt += focusGuidelines[focus]
            }

            // 언어 정보 추가 (있는 경우)
            if (language) {
                prompt += `\n\n**참고**: 이 코드는 ${language}로 작성되었습니다.`
            }

            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: prompt
                        }
                    }
                ]
            }
        }
    )

    // Smithery 배포: server.server 반환 (내부 MCP 서버 객체)
    return server.server
}
