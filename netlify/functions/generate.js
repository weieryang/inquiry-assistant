exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { customerId, inquiry, platform, lang, tone, priceRange, model, knowledgeBase } = JSON.parse(event.body);

        if (!customerId || !inquiry) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing customerId or inquiry' }) };
        }

        const API_KEY = process.env.DEEPSEEK_API_KEY;
        if (!API_KEY) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
        }

        const MODEL = model === 'pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';

        const langNames = { en: 'English', es: 'Espa帽ol', ru: '袪褍褋褋泻懈泄', ar: '丕賱毓乇亘賷丞', pt: 'Portugu锚s', fr: 'Fran莽ais', de: 'Deutsch', tr: 'T眉rk莽e' };
        const toneNames = { professional: '涓撲笟鍟嗗姟锛堟寮忋€佷弗璋級', friendly: '鐑儏鍙嬪ソ锛堜翰鍒囥€佹湁娓╁害锛?, concise: '绠€娲侀珮鏁堬紙鐩村涓婚锛? };
        const platformNames = { alibaba: '闃块噷宸村反鍥介檯绔?, mic: '涓浗鍒堕€犵綉', '1688': '1688鎵瑰彂骞冲彴' };

        const systemPrompt = `浣犳槸涓€涓笓涓氱殑璺ㄥ鐢靛晢璇㈢洏鍥炲涓撳锛屼笓闂ㄤ负寤烘潗/瀹跺眳鍝佺被鐨勫崠瀹舵湇鍔°€?
## 鍥炲瑕佹眰
- 鍥炲璇█锛?{langNames[lang] || 'English'}
- 璇皵椋庢牸锛?{toneNames[tone] || '涓撲笟鍟嗗姟'}
- 骞冲彴锛?{platformNames[platform] || '鍥介檯绔?}
- 鍥炲鎺у埗鍦?00-500瀛楋紝涓撲笟鏈夋俯搴?- 浣跨敤鍒楄〃鍒嗙偣璇存槑锛屾彁楂樺彲璇绘€?- 鏈熬鍔犲叆 [Your Name] [Company Name] 鍗犱綅绗?${priceRange ? `- 閫傚綋缁欏嚭鍙傝€冧环鏍煎尯闂?${priceRange}锛屼絾娉ㄦ槑鍏蜂綋闇€纭` : ''}

## 琛屼笟鐭ヨ瘑
- 寤烘潗/瀹跺眳鍝佺被涓撳锛堢摲鐮栥€侀棬绐椼€佺伅鍏枫€佸崼娴达級
- 鐔熸倝FOB/CIF/DDP绛夎锤鏄撴潯娆?- 浜嗚ВCE/ISO/SGS绛夎璇?
## 浜у搧鐭ヨ瘑搴?${knowledgeBase || '锛堟殏鏃狅紝璇风敤閫氱敤涓撲笟鍥炲锛?}

## 瑙勫垯
1. 鍙熀浜庡綋鍓嶈鐩樺拰鐭ヨ瘑搴撳洖澶?2. 涓嶇紪閫犱笉瀛樺湪鐨勪骇鍝佷俊鎭?3. 涔板鍐呭涓嶆硠闇瞏;

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: inquiry }
                ],
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const err = await response.text();
            return { statusCode: 500, headers, body: JSON.stringify({ error: `DeepSeek API error: ${response.status}` }) };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                reply: data.choices[0].message.content,
                model: MODEL,
                customerId
            })
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};