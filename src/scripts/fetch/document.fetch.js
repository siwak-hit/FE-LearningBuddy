import { ApiService } from './api.js';

export const DocumentAPI = {
  getDocumentsByProject: (projectId) => ApiService.get(`/documents/project/${projectId}`),
  uploadDocument: (formData) => ApiService.upload('/documents/upload', formData),
  deleteDocument: (id) => ApiService.delete(`/documents/${id}`),
  indexDocument: (id) => ApiService.post(`/documents/${id}/index`, {})
};
