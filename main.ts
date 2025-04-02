// deno_main.ts

import { serve } from "https://deno.land/std/http/server.ts";

const sendCaptchaEndpoint = "https://www.juchats.com/gw/chatweb/user/email/sendCaptcha";
const regLoginEndpoint = "https://www.juchats.com/gw/chatweb/user/email/regLogin";

// 替换为您部署的临时邮箱API地址
const tempMailApiBaseUrl = 'https://blmailapi.deno.dev';

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0"
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// 生成随机临时邮箱
const generateTempEmail = async () => {
  try {
    const response = await fetch(`${tempMailApiBaseUrl}/api/create?length=10`);
    if (!response.ok) {
      throw new Error(`生成临时邮箱错误，状态码：${response.status}`);
    }
    const data = await response.json();
    return { email: data.email };
  } catch (error) {
    console.error("生成临时邮箱失败:", error);
    throw error;
  }
};

// 获取邮件列表
const getEmailContent = async (email) => {
  try {
    const response = await fetch(`${tempMailApiBaseUrl}/api/mailbox?email=${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error(`获取邮件内容错误，状态码：${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`获取邮件内容失败: ${error}`);
    throw error;
  }
};

// 获取邮件原始源码
const getEmailSource = async (email, emailId) => {
  try {
    const response = await fetch(`${tempMailApiBaseUrl}/api/source/${encodeURIComponent(email)}/${emailId}`);
    if (!response.ok) {
      throw new Error(`获取邮件源码错误，状态码：${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`获取邮件源码失败: ${error}`);
    throw error;
  }
};

// 提取验证码// 提取验证码的函数修改版
const extractVerificationCode = async (email) => {
  const maxAttempts = 10;
  const retryInterval = 5000; // 5秒
  let attempts = 0;
  let lastEmailCount = 0;

  while (attempts < maxAttempts) {
    try {
      console.log(`尝试 ${attempts+1}/${maxAttempts}: 获取邮箱 ${email} 的邮件...`);
      const emails = await getEmailContent(email);
      
      // 检查是否有新邮件
      if (Array.isArray(emails) && emails.length > 0) {
        console.log(`找到 ${emails.length} 封邮件，邮件主题: "${emails[0].subject}"`);
        
        // 遍历所有邮件（从最新到最旧）
        for (const emailInfo of emails) {
          if (emailInfo && emailInfo.id) {
            try {
              console.log(`获取邮件ID: ${emailInfo.id} 的源码...`);
              // 获取邮件源码
              const emailSource = await getEmailSource(email, emailInfo.id);
              
              if (emailSource) {
                console.log(`成功获取邮件源码，长度: ${emailSource.length} 字符`);
                
                // 1. 特别针对JuChat邮件的验证码格式
                // 从HTML部分提取六位数字验证码
                let codeMatch = emailSource.match(/<p[^>]*>(\d{6})<\/p>/i);
                if (codeMatch) {
                  console.log(`成功从HTML标签中提取验证码: ${codeMatch[1]}`);
                  return codeMatch[1];
                }
                
                // 2. 在引用可打印编码中寻找验证码
                codeMatch = emailSource.match(/font-weight:[^>]*>(\d{6})<\/p>/);
                if (codeMatch) {
                  console.log(`成功从引用可打印编码中提取验证码: ${codeMatch[1]}`);
                  return codeMatch[1];
                }
                
                // 3. 在Content-Type: text/html 之后的部分搜索验证码 - 避免在头部匹配到数字
                const htmlParts = emailSource.split('Content-Type: text/html');
                if (htmlParts.length > 1) {
                  const htmlPart = htmlParts[1];
                  codeMatch = htmlPart.match(/(\d{6})/);
                  if (codeMatch) {
                    console.log(`成功从HTML内容中提取验证码: ${codeMatch[1]}`);
                    return codeMatch[1];
                  }
                }
                
                // 4. 输出邮件内容的一部分用于调试
                console.log("未找到验证码，尝试显示邮件内容的关键部分:");
                // 检查是否包含关键部分
                if (emailSource.includes('verification code')) {
                  const start = emailSource.indexOf('verification code');
                  console.log(`邮件包含关键词"verification code"，上下文: "${emailSource.substring(Math.max(0, start - 50), start + 150)}"`);
                }
                
                // 5. 最后尝试在整个邮件中搜索6位数字，但优先考虑前面的方法
                const allDigits = emailSource.match(/\d{6}/g);
                if (allDigits && allDigits.length > 0) {
                  // 搜集所有6位数字
                  console.log(`在邮件中找到以下6位数字: ${allDigits.join(', ')}`);
                  
                  // 尝试查找更可能是验证码的数字
                  // 在HTML内容中出现的第一个6位数字最可能是验证码
                  if (htmlParts.length > 1) {
                    const htmlDigits = htmlParts[1].match(/\d{6}/g);
                    if (htmlDigits && htmlDigits.length > 0) {
                      console.log(`在HTML内容中找到的第一个6位数是: ${htmlDigits[0]}`);
                      return htmlDigits[0];
                    }
                  }
                  
                  // 如果以上方法都失败，返回找到的第一个6位数字
                  console.log(`未能确定哪个是验证码，使用第一个找到的6位数: ${allDigits[0]}`);
                  return allDigits[0];
                }
                
                console.log("未找到任何6位数字验证码");
              } else {
                console.log("获取的邮件源码为空");
              }
            } catch (error) {
              console.error(`获取邮件 ${emailInfo.id} 的源码时出错:`, error);
            }
          }
        }
        
        // 如果已经检查了所有邮件但没找到验证码
        console.log("已检查所有邮件但未找到验证码，继续等待新邮件...");
      } else {
        console.log(`尝试 ${attempts+1}/${maxAttempts}: 没有邮件，等待中...`);
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    } catch (error) {
      console.error(`尝试 ${attempts+1}/${maxAttempts} 获取验证码失败:`, error);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }
  }

  console.error("多次尝试获取验证码失败。");
  return null;
};

// 发送邮件验证码
const sendEmailCaptcha = async (email) => {
  const userAgent = getRandomUserAgent();
  const requestId = crypto.randomUUID();
  const headers = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "content-type": "application/json",
    "noninductive": "true",
    "priority": "u=1, i",
    "sec-ch-ua": '"Not A(Brand";v="99", "Chromium";v="123", "Microsoft Edge";v="123"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "cookie": "_ga=GA1.1.2059922291.1740792140; _hjSessionUser_3891016=eyJpZCI6IjVlMGI1MzY0LWVmNGYtNTQ0Mi04NzZiLTM1OGYwYjYzMTQ3YSIsImNyZWF0ZWQiOjE3NDA3OTIxNDA2MjEsImV4aXN0aW5nIjp0cnVlfQ==; _hjSession_3891016=eyJpZCI6ImExOGFiNjZjLWMyOTMtNDZjNC04MGZhLTA0ZjQ2NTA2ZDI4ZCIsImMiOjE3NDA3OTIxNDA2MjIsInMiOjEsInIiOjEsInBiIjowLCJzciI6MCwic2UiOjAsImZzIjoxLCJzcCI6MH0=; _ga_BGPCRVYLM7=GS1.1.1740792139.1.1.1740794456.0.0.0",
    "Referer": "https://www.juchats.com/login",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "User-Agent": userAgent,
    "X-Request-ID": requestId
  };

  const body = JSON.stringify({ email, type: 1 });

  try {
    console.log(`发送验证码到邮箱: ${email}`);
    const response = await fetch(sendCaptchaEndpoint, {
      method: "POST",
      headers: headers,
      body: body
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`发送验证码请求失败，状态码：${response.status}，内容：${responseText}`);
      throw new Error(`HTTP 错误! 状态码: ${response.status}, 内容: ${responseText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("发送验证码出错:", error);
    throw error;
  }
};

// 注册/登录
// 注册/登录
const registerLoginWithEmail = async (email, code, inviteCode = "") => {
  const userAgent = getRandomUserAgent();
  const requestId = crypto.randomUUID();
 const headers = {
  "accept": "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  "content-type": "application/json",
  "noninductive": "true",
  "priority": "u=1, i",
  "sec-ch-ua": '"Not A(Brand";v="99", "Chromium";v="123", "Microsoft Edge";v="123"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  // 移除cookie头
  "Referer": "https://www.juchats.com/login",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "User-Agent": userAgent,
  "X-Request-ID": requestId
};
  const body = JSON.stringify({ email, code, inviteCode });

  try {
    console.log(`尝试注册/登录: ${email}, 验证码: ${code}`);
    const response = await fetch(regLoginEndpoint, {
      method: "POST",
      headers: headers,
      body: body
    });

    // 获取完整响应文本
    const responseText = await response.text();
    console.log(`注册/登录响应状态码: ${response.status}`);
    console.log(`注册/登录完整响应内容: ${responseText}`);
    
    // 尝试解析JSON
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("响应不是有效的JSON格式:", parseError);
      throw new Error(`响应解析失败: ${responseText}`);
    }

    if (!response.ok) {
      console.error(`注册/登录请求失败，状态码：${response.status}，错误码：${jsonResponse?.code || 'unknown'}，错误信息：${jsonResponse?.message || 'unknown'}`);
      throw new Error(`HTTP 错误! 状态码: ${response.status}, 错误详情: ${JSON.stringify(jsonResponse)}`);
    }

    return jsonResponse;
  } catch (error) {
    console.error("注册/登录出错:", error);
    console.error("详细错误信息:", error.message);
    throw error;
  }
};

// 完整的注册流程
const completeRegistration = async (inviteCode = "") => {
  try {
    // 1. 生成临时邮箱
    console.log("正在生成临时邮箱...");
    const tempEmailResult = await generateTempEmail();
    const email = tempEmailResult.email;
    console.log(`成功创建临时邮箱: ${email}`);
    
    // 2. 发送验证码到临时邮箱
    console.log("正在请求发送验证码...");
    const captchaResult = await sendEmailCaptcha(email);
    
    if (captchaResult?.code === 200) {
      console.log("验证码发送成功，等待接收邮件...");
      
      // 3. 提取验证码
      console.log("开始获取验证码...");
      const verificationCode = await extractVerificationCode(email);
      
      if (verificationCode) {
        // 4. 使用验证码注册/登录
        console.log("正在使用验证码注册/登录...");
        const regLoginResult = await registerLoginWithEmail(email, verificationCode, inviteCode);
        
        if (regLoginResult?.code === 200 && regLoginResult?.data?.token) {
          const token = regLoginResult.data.token;
          console.log("注册/登录成功!");
          
          // 返回完整结果
          return {
            success: true,
            message: "注册/登录成功",
            email: email,
            token: token,
            fullResponse: regLoginResult
          };
        } else {
          return {
            success: false,
            message: "注册/登录失败，服务器响应无效",
            error: regLoginResult
          };
        }
      } else {
        return {
          success: false,
          message: "无法获取验证码",
        };
      }
    } else {
      return {
        success: false,
        message: "发送验证码失败",
        error: captchaResult
      };
    }
  } catch (error) {
    console.error("注册过程出错:", error);
    return {
      success: false,
      message: error.message || "注册过程发生未知错误",
      error: error
    };
  }
};

// HTTP 服务器处理请求
serve(async (req) => {
  // 设置CORS头
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  // 处理预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;
  
  // 主路由 - 显示使用说明
  if (pathname === "/" || pathname === "") {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JuChat 自动注册服务</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
  <style>
    :root {
      --primary: #4285f4;
      --primary-dark: #3367d6;
      --success: #0f9d58;
      --success-dark: #0b8043;
      --danger: #db4437;
      --warning: #f4b400;
      --light-bg: #f5f7fa;
      --dark: #333333;
      --gray: #757575;
      --card-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
      color: var(--dark);
      max-width: 800px;
      margin: 0 auto;
      padding: 30px 20px;
      line-height: 1.6;
      min-height: 100vh;
    }
    
    .container {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 16px;
      padding: 35px;
      box-shadow: var(--card-shadow);
      margin-bottom: 25px;
      transition: all 0.4s ease;
      border: 1px solid rgba(255, 255, 255, 0.5);
      backdrop-filter: blur(10px);
    }
    
    .container:hover {
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
      transform: translateY(-2px);
    }
    
    .brand-logo {
      width: 80px;
      height: 80px;
      margin: 0 auto 25px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20px;
      background: linear-gradient(45deg, #4285f4, #34a853);
      box-shadow: 0 6px 15px rgba(66, 133, 244, 0.3);
      color: white;
      font-size: 36px;
    }
    
    h1 {
      background: linear-gradient(135deg, #4285f4, #34a853);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      text-align: center;
      margin-bottom: 25px;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    
    p {
      color: var(--gray);
      margin-bottom: 25px;
      text-align: center;
      font-size: 16px;
    }
    
    .form-group {
      margin-bottom: 25px;
    }
    
    label {
      display: block;
      margin-bottom: 10px;
      font-weight: 600;
      color: var(--dark);
      font-size: 15px;
    }
    
    input[type="text"] {
      width: 100%;
      padding: 14px 18px;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      font-size: 16px;
      transition: all 0.3s ease;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
    }
    
    input[type="text"]:focus {
      border-color: var(--primary);
      outline: none;
      box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.15);
    }
    
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #4285f4 0%, #3367d6 100%);
      color: white;
      padding: 14px 25px;
      border: none;
      text-decoration: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
    }
    
    .button:hover {
      background: linear-gradient(135deg, #3b78e7 0%, #2d5ac8 100%);
      transform: translateY(-3px);
      box-shadow: 0 6px 15px rgba(66, 133, 244, 0.4);
    }
    
    .button:active {
      transform: translateY(-1px);
    }
    
    .button-success {
      background: linear-gradient(135deg, #0f9d58 0%, #0b8043 100%);
      box-shadow: 0 4px 12px rgba(15, 157, 88, 0.3);
    }
    
    .button-success:hover {
      background: linear-gradient(135deg, #0e9150 0%, #0a733c 100%);
      box-shadow: 0 6px 15px rgba(15, 157, 88, 0.4);
    }
    
    .results {
      margin-top: 30px;
    }
    
    pre {
      background: #f8f9fa;
      padding: 22px;
      border-radius: 12px;
      overflow-x: auto;
      border: 1px solid #eaeaea;
      font-family: Consolas, Monaco, 'Andale Mono', monospace;
      font-size: 14px;
    }
    
    #loadingMessage {
      text-align: center;
      padding: 40px 0;
    }
    
    .spinner {
      border: 4px solid rgba(66, 133, 244, 0.15);
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border-left-color: var(--primary);
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .token-box {
      background: #f8f9fa;
      border: 1px solid #eaeaea;
      border-radius: 12px;
      padding: 22px;
      margin-top: 25px;
      transition: all 0.3s ease;
    }
    
    .token-box:hover {
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.08);
      border-color: #d8d8d8;
    }
    
    .token-box h3 {
      margin-bottom: 15px;
      color: var(--dark);
    }
    
    .copy-container {
      display: flex;
      margin-top: 15px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      border-radius: 12px;
      overflow: hidden;
    }
    
    #tokenField {
      flex: 1;
      padding: 14px 18px;
      border: 1px solid #e0e0e0;
      border-right: none;
      border-radius: 12px 0 0 12px;
      font-family: monospace;
      font-size: 15px;
      background: white;
    }
    
    #copyToken {
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0 12px 12px 0;
      padding: 0 22px;
      cursor: pointer;
      transition: background 0.3s;
      font-size: 16px;
    }
    
    #copyToken:hover {
      background: var(--primary-dark);
    }
    
    .status-message {
      text-align: center;
      padding: 12px;
      border-radius: 12px;
      margin-top: 15px;
      display: none;
      transition: all 0.3s ease;
      font-weight: 500;
    }
    
    .success-message {
      background-color: rgba(15, 157, 88, 0.1);
      border: 1px solid rgba(15, 157, 88, 0.3);
      color: var(--success);
    }
    
    .error-message {
      background-color: rgba(219, 68, 55, 0.1);
      border: 1px solid rgba(219, 68, 55, 0.3);
      color: var(--danger);
    }
    
    .icon-space {
      margin-right: 8px;
    }
    
    .steps-container {
      margin: 25px 0;
      padding: 0;
    }
    
    .step-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 1px dashed #e0e0e0;
    }
    
    .step-item:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    
    .step-number {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 30px;
      height: 30px;
      background: linear-gradient(135deg, #4285f4, #34a853);
      color: white;
      border-radius: 50%;
      font-weight: bold;
      margin-right: 15px;
      flex-shrink: 0;
    }
    
    .step-content {
      flex: 1;
    }
    
    .step-title {
      font-weight: 600;
      margin-bottom: 5px;
      color: var(--dark);
    }
    
    .step-description {
      color: var(--gray);
      font-size: 14px;
    }
    
    .result-title {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .result-title i {
      font-size: 24px;
      margin-right: 12px;
    }
    
    .success-color {
      color: var(--success);
    }
    
    .error-color {
      color: var(--danger);
    }
    
    .warning-color {
      color: var(--warning);
    }
    
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      color: var(--gray);
      font-size: 14px;
    }
    
    @media (max-width: 600px) {
      body {
        padding: 15px;
      }
      
      .container {
        padding: 25px 20px;
        border-radius: 12px;
      }
      
      h1 {
        font-size: 24px;
      }
      
      .button {
        padding: 12px 20px;
      }
      
      .brand-logo {
        width: 60px;
        height: 60px;
        font-size: 28px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand-logo">
      <i class="fas fa-comments"></i>
    </div>
    <h1>JuChat 自动注册服务</h1>
    <p>此服务可自动生成临时邮箱并完成JuChat的注册流程，获取账号令牌秒开始聊天</p>
    
    <div class="steps-container">
      <div class="step-item">
        <div class="step-number">1</div>
        <div class="step-content">
          <div class="step-title">输入邀请码</div>
          <div class="step-description">如您有邀请码，请在下方输入框中填写，否则可以直接留空</div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-number">2</div>
        <div class="step-content">
          <div class="step-title">点击开始注册</div>
          <div class="step-description">系统将自动为您创建账号并获取登录令牌</div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-number">3</div>
        <div class="step-content">
          <div class="step-title">复制登录令牌</div>
          <div class="step-description">获取到令牌后，将其复制到JuChat2api中进行使用</div>
        </div>
      </div>
    </div>
    
    <form id="registrationForm">
      <div class="form-group">
        <label for="inviteCode"><i class="fas fa-ticket-alt icon-space"></i>邀请码 (可选):</label>
        <input type="text" id="inviteCode" name="inviteCode" placeholder="如有邀请码请输入，没有可留空">
      </div>
      <button type="button" id="startButton" class="button">
        <i class="fas fa-paper-plane icon-space"></i>开始注册
      </button>
    </form>
    
    <div id="statusMessage" class="status-message"></div>
  </div>
  
  <div id="loadingMessage" class="container" style="display: none;">
    <div class="spinner"></div>
    <p>系统正在为您注册账号，请耐心等待...</p>
    <p style="font-size: 14px; color: #666;">注册过程可能需要几秒钟时间，请不要关闭页面</p>
  </div>
  
  <div id="resultContainer" class="container" style="display: none;">
    <div class="result-title">
      <i class="fas fa-check-circle success-color"></i>
      <h2>注册成功</h2>
    </div>
    <div class="results">
      <h3><i class="fas fa-info-circle icon-space"></i>详细信息:</h3>
      <pre id="resultJson"></pre>
      
      <div class="token-box">
        <h3><i class="fas fa-key icon-space"></i>登录令牌:</h3>
        <p style="text-align: left; color: #666; font-size: 14px;">复制下方令牌到JuChat应用中进行登录</p>
        <div class="copy-container">
          <input type="text" id="tokenField" readonly>
          <button id="copyToken" title="复制令牌"><i class="fas fa-copy"></i></button>
        </div>
      </div>
      
      <button id="newRegistration" class="button button-success" style="margin-top: 25px;">
        <i class="fas fa-plus-circle icon-space"></i>创建新账号
      </button>
    </div>
  </div>
  
  <div class="footer">
    © 2025 JuChat 自动注册服务 | 使用即代表您同意服务条款
  </div>
  
  <script>
    document.getElementById('startButton').addEventListener('click', async () => {
      const inviteCode = document.getElementById('inviteCode').value;
      const loadingMessage = document.getElementById('loadingMessage');
      const resultContainer = document.getElementById('resultContainer');
      const resultJson = document.getElementById('resultJson');
      const statusMessage = document.getElementById('statusMessage');
      
      // 隐藏状态消息
      statusMessage.style.display = 'none';
      
      // 显示加载信息
      loadingMessage.style.display = 'block';
      resultContainer.style.display = 'none';
      
      try {
              const response = await fetch(\`/register\${inviteCode ? '?invite=' + encodeURIComponent(inviteCode) : ''}\`);
        if (!response.ok) {
          throw new Error("服务器返回错误: " + response.status);
        }
        
        const result = await response.json();
        
        // 显示结果
        resultJson.textContent = JSON.stringify(result, null, 2);
        
        // 填充令牌字段
        if (result.success && result.token) {
          document.getElementById('tokenField').value = result.token;
          const titleEl = resultContainer.querySelector('.result-title');
          titleEl.innerHTML = '<i class="fas fa-check-circle success-color"></i><h2>注册成功</h2>';
        } else {
          const titleEl = resultContainer.querySelector('.result-title');
          titleEl.innerHTML = '<i class="fas fa-exclamation-triangle warning-color"></i><h2>注册过程出现问题</h2>';
        }
        
        // 隐藏加载信息，显示结果
        loadingMessage.style.display = 'none';
        resultContainer.style.display = 'block';
      } catch (error) {
        resultJson.textContent = JSON.stringify({ 
          error: '请求失败', 
          message: error.message 
        }, null, 2);
        
        const titleEl = resultContainer.querySelector('.result-title');
        titleEl.innerHTML = '<i class="fas fa-times-circle error-color"></i><h2>注册失败</h2>';
        
        loadingMessage.style.display = 'none';
        resultContainer.style.display = 'block';
      }
    });
    
    // 复制令牌按钮 - 使用现代Clipboard API
    document.getElementById('copyToken').addEventListener('click', () => {
      const tokenField = document.getElementById('tokenField');
      const statusMessage = document.getElementById('statusMessage');
      
      // 检查Clipboard API支持
      if (navigator.clipboard) {
        navigator.clipboard.writeText(tokenField.value)
          .then(() => {
            showStatus('success', '令牌已复制到剪贴板');
          })
          .catch(() => {
            // 回退到旧方法
            fallbackCopy(tokenField, statusMessage);
          });
      } else {
        // 回退到旧方法
        fallbackCopy(tokenField, statusMessage);
      }
    });
    
    function fallbackCopy(tokenField, statusMessage) {
      tokenField.select();
      try {
        document.execCommand('copy');
        showStatus('success', '令牌已复制到剪贴板');
      } catch (err) {
        showStatus('error', '复制失败，请手动复制令牌');
      }
    }
    
    function showStatus(type, message) {
      const statusMessage = document.getElementById('statusMessage');
      statusMessage.className = 'status-message';
      statusMessage.classList.add(type === 'success' ? 'success-message' : 'error-message');
      
      const icon = type === 'success' ? 
        '<i class="fas fa-check-circle icon-space"></i>' : 
        '<i class="fas fa-exclamation-circle icon-space"></i>';
      
      statusMessage.innerHTML = icon + message;
      statusMessage.style.display = 'block';
      
      // 添加动画效果
      statusMessage.style.opacity = '0';
      statusMessage.style.transform = 'translateY(10px)';
      
      setTimeout(() => {
        statusMessage.style.opacity = '1';
        statusMessage.style.transform = 'translateY(0)';
      }, 10);
      
      // 3秒后自动隐藏
      setTimeout(() => {
        statusMessage.style.opacity = '0';
        statusMessage.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          statusMessage.style.display = 'none';
        }, 300);
      }, 3000);
    }
    
    // 创建新账号按钮
    document.getElementById('newRegistration').addEventListener('click', () => {
      document.getElementById('inviteCode').value = '';
      document.getElementById('resultContainer').style.display = 'none';
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  </script>
</body>
</html>
    `;
    
    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  }
  
  // 注册端点
  if (pathname === "/register") {
    const inviteCode = url.searchParams.get("invite") || "";
    
    console.log(`开始注册流程${inviteCode ? '，邀请码: ' + inviteCode : ''}...`);
    
    try {
      const result = await completeRegistration(inviteCode);
      return new Response(JSON.stringify(result), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      const errorResponse = {
        success: false,
        message: "服务器处理注册请求时出错",
        error: error.message
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
  }
  
  // 旧版兼容性端点
  if (pathname === "/start") {
    const result = await completeRegistration();
    if (result.success) {
      return new Response(`注册成功，Token: ${result.token}`, {
        headers: corsHeaders
      });
    } else {
      return new Response(`注册失败: ${result.message}`, {
        headers: corsHeaders
      });
    }
  }

  // 404 - 未找到
  return new Response(JSON.stringify({ error: "路径不存在" }), {
    status: 404,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
});

console.log("JuChat 注册服务已启动");