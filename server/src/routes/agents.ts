// Agent 状态路由
import type { FastifyInstance } from 'fastify';
import { agentOverview } from '../modules/agents.js';

export async function register(fastify: FastifyInstance) {
  fastify.get('/agents/overview', () => agentOverview());
}
