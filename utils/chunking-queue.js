import { Queue } from 'bullmq';

const chunkingqueue = new Queue('chunking-queue',{ connection:{
    host:'localhost',
    port:'6379'
  }});

export default chunkingqueue;