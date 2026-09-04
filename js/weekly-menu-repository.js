import { apiRequest, getAuthToken } from "./api-client.js";

export const weeklyMenuRepository = {
  isAuthenticated: () => Boolean(getAuthToken()),
  async get(weekStart) {
    try {
      const payload = await apiRequest(`/api/weekly-menus/${encodeURIComponent(weekStart)}`);
      return payload.menu;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  },
  async save(menu) {
    const payload = await apiRequest(`/api/weekly-menus/${encodeURIComponent(menu.weekStart)}`, {
      method: "PUT", body: menu
    });
    return payload.menu;
  }
};
