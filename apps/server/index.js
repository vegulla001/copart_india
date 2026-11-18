const {createApp}=require('./app');
const port=Number(process.env.PORT||4000);
const failureRate=Number(process.env.FAIL_RATE||0);
const delayMs=Number(process.env.DELAY_MS||0);
createApp({failureRate,delayMs}).listen(port,'0.0.0.0',()=>{
 console.log(`PW intake mock server listening at http://0.0.0.0:${port} (FAIL_RATE=${failureRate}, DELAY_MS=${delayMs})`);
});
