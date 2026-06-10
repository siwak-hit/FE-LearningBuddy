import { ApiService } from './api.js';

export const KnowledgeAPI = {
  // =========================
  // FAQs
  // =========================
  getFaqsByProject: (projectId) =>
    ApiService.get(`/knowledge/faqs/project/${projectId}`),

  createFaq: (data) =>
    ApiService.post('/knowledge/faqs', data),

  updateFaq: (id, data) =>
    ApiService.put(`/knowledge/faqs/${id}`, data),

  deleteFaq: (id) =>
    ApiService.delete(`/knowledge/faqs/${id}`),

  importFaqExcel: (formData) =>
    ApiService.upload('/knowledge/faqs/import', formData),

  // =========================
  // Activities
  // =========================
  getActivitiesByProject: (projectId) =>
    ApiService.get(`/knowledge/activities/project/${projectId}`),

  createActivity: (data) =>
    ApiService.post('/knowledge/activities', data),

  updateActivity: (id, data) =>
    ApiService.put(`/knowledge/activities/${id}`, data),

  deleteActivity: (id) =>
    ApiService.delete(`/knowledge/activities/${id}`),

  importActivityExcel: (formData) =>
    ApiService.upload('/knowledge/activities/import', formData),

  // =========================
  // KB QA / Validation
  // =========================
  getChunksByProject: (projectId) =>
    ApiService.get(`/rag/chunks/project/${projectId}`),

  testRetrieval: (payload) =>
    ApiService.post('/rag/query', payload),

  createChatSession: (payload) =>
    ApiService.post('/chat/session', payload),

  sendChatMessage: (payload) =>
    ApiService.post('/chat/send', payload)
};
