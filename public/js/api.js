// API 封装
const API = {
  token: localStorage.getItem('token'),
  baseURL: '/api',

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  },

  async request(method, url, data, options = {}) {
    const config = {
      method,
      url: this.baseURL + url,
      headers: { 'Content-Type': 'application/json' },
      ...options
    };
    if (this.token) config.headers.Authorization = `Bearer ${this.token}`;
    if (data && ['post', 'put', 'delete'].includes(method)) config.data = data;
    if (data && method === 'get') config.params = data;

    try {
      const res = await axios(config);
      return res.data;
    } catch (err) {
      if (err.response?.status === 401) {
        this.setToken(null);
        localStorage.removeItem('user');
        window.location.hash = '#/login';
      }
      throw err.response?.data || err;
    }
  },

  get(url, params) { return this.request('get', url, params); },
  post(url, data) { return this.request('post', url, data); },
  put(url, data) { return this.request('put', url, data); },
  del(url, data) { return this.request('delete', url, data); },

  // 文件上传
  async upload(url, file) {
    const formData = new FormData();
    formData.append('file', file);
    const config = {
      method: 'post',
      url: this.baseURL + url,
      data: formData,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'multipart/form-data'
      }
    };
    const res = await axios(config);
    return res.data;
  },

  // 文件下载
  async download(url, params, filename) {
    const config = {
      method: 'get',
      url: this.baseURL + url,
      params,
      responseType: 'blob',
      headers: { Authorization: `Bearer ${this.token}` }
    };
    const res = await axios(config);
    const blob = new Blob([res.data]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
};
