import { Queue } from 'bullmq';

const resultqueue = new Queue('result-queue',{ connection:{
    host:'localhost',
    port:'6379'
  }});

export default resultqueue;