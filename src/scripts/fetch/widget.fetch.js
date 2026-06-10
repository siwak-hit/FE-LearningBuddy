import { ApiService } from './api.js';

export const WidgetApi = {
  getConfig(projectKey) {
    return ApiService.fetch(`/widget/config/${projectKey}`);
  },
  updateConfig(configId, payload) {
    return ApiService.fetch(`/widget/config/${configId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }
};
