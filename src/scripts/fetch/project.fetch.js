import { ApiService } from './api.js';

export const ProjectApi = {
  getAll() {
    return ApiService.fetch('/projects');
  },
  create(payload) {
    return ApiService.fetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
  },
  delete(id) {
    return ApiService.fetch(`/projects/${id}`, { method: 'DELETE' });
  }
};
