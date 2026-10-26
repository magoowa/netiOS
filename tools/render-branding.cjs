'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),texts=require('../app/strings.json');
(async()=>{
    const bases=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean);
    const executablePath=process.env.BRAVE_EXECUTABLE||bases.map(base=>path.join(base,'BraveSoftware/Brave-Browser/Application/brave.exe')).find(file=>fs.existsSync(file));
    if(!executablePath)throw Error('BRAVE_REQUIRED_FOR_ASSETS');
    const browser=await chromium.launch({executablePath,headless:true});
    try{
        const page=await browser.newPage({viewport:{width:256,height:256}});
        const logo='data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'app/assets/netios.svg')).toString('base64');
        const fonts=fs.readFileSync(path.join(root,'app/style.css'),'utf8').match(/@font-face\s*\{[^}]*\}/g).join('\n').replace(/url\(['"]?([^)'"\s]+)['"]?\)/g,(match,file)=>'url(data:font/woff2;base64,'+fs.readFileSync(path.join(root,'app',file)).toString('base64')+')');
        await page.setContent('<style>'+fonts+'body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:transparent}img{width:232px}p{position:absolute;bottom:40px;left:40px;right:40px;color:#aeb6c0;font:22px "Josefin Sans",sans-serif;text-align:center}</style><img><p hidden></p>');
        await page.locator('img').evaluate((node,src)=>{node.src=src;},logo);await page.locator('img').evaluate(node=>node.decode());
        await page.screenshot({path:path.join(root,'app/assets/icon.png'),omitBackground:true});
        await page.setViewportSize({width:1920,height:1080});
        await page.evaluate(disclaimer=>{document.body.style.background='#080808';document.querySelector('img').style.width='600px';const p=document.querySelector('p');p.hidden=false;p.textContent=disclaimer;},texts['app.disclaimer']);
        await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,'app/assets/splash.png')});
    }finally{await browser.close();}
})().catch(error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:'BRANDING_FAILED');process.exitCode=1;});
