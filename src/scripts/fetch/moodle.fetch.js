import { ApiService } from './api.js';

export const MoodleApi = {
  getConfig(projectId) {
    return ApiService.fetch(`/moodle/config?projectId=${projectId}`);
  },
  saveConfig(payload) {
    return ApiService.fetch('/moodle/config', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  testConnection(payload) {
    return ApiService.fetch('/moodle/test', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  previewCourseMap(payload) {
    return ApiService.fetch('/moodle/courses/preview-map', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  syncCourseMap(payload) {
    return ApiService.fetch('/moodle/courses/sync-map', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getCourseContents(projectId, courseId) {
    return ApiService.fetch(`/moodle/course-contents?projectId=${projectId}&courseId=${courseId}`);
  },
  syncCourse(payload) {
    return ApiService.fetch('/moodle/sync/course', { method: 'POST', body: JSON.stringify(payload) });
  },
  syncAllCourses(payload) {
    return ApiService.fetch('/moodle/sync/all', { method: 'POST', body: JSON.stringify(payload) });
  },
  previewMaterials(projectId) {
    return ApiService.fetch(`/moodle/preview-materials?projectId=${projectId}`);
  },
  getChunks(projectId) {
    return ApiService.fetch(`/moodle/chunks?projectId=${projectId}`);
  }
};
