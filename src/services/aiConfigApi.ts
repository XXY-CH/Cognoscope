/**
 * aiConfigApi - AI 配置管理接口
 * 后端路由：/api/v1/preferences/ai-config
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface AiConfig {
  base_url: string;
  model: string;
  configured: boolean;
}

export interface AiConfigUpdate {
  base_url: string;
  api_key: string;
  model: string;
}

/**
 * 获取当前 AI 配置
 */
export async function getAiConfig(): Promise<AiConfig> {
  const response = await fetch(`${API_BASE}/preferences/ai-config`);
  
  if (!response.ok) {
    throw new Error('获取 AI 配置失败');
  }
  
  return await response.json();
}

/**
 * 更新 AI 配置
 */
export async function updateAiConfig(config: AiConfigUpdate): Promise<AiConfig> {
  const response = await fetch(`${API_BASE}/preferences/ai-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '更新 AI 配置失败');
  }
  
  return await response.json();
}