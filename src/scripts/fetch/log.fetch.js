// src/scripts/fetch/log.fetch.js
import { ApiService } from './api.js';

export const LogAPI = {
  getSummary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return ApiService.get(`/logs/summary?${query}`);
  },
  getSessions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return ApiService.get(`/logs/sessions?${query}`);
  },
  getSessionDetail: (sessionId) => {
    return ApiService.get(`/logs/sessions/${sessionId}`);
  }
};
