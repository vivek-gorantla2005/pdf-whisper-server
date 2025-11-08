import { Queue } from 'bullmq';

const memoryeventqueue = new Queue('memory-event-queue',{ connection:{
    host:'localhost',
    port:'6379'
  }});

export default memoryeventqueue;