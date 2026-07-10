/* Labour.Group browser API client.
 * Sends all frontend requests to the same-origin Cloudflare Pages Function.
 */
const LG_API = (() => {
  const API_URL = '/api';

  async function request(action, args) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8'
      },
      body: JSON.stringify({
        action: String(action || ''),
        args: Array.isArray(args) ? args : []
      })
    });

    const text = await response.text();
    let result;

  try {
  result = JSON.parse(text);
} catch (error) {
  console.error('Invalid API response:', {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    responseText: text
  });

  throw new Error(
    'Invalid API response: ' + String(text || '')   .replace(/<style[\s\S]*?<\/style>/gi, '')   .replace(/<[^>]+>/g, ' ')   .replace(/\s+/g, ' ')   .trim()   .slice(0, 1500)
  );
}

    if (!response.ok || !result || result.ok !== true) {
      throw new Error(
        result && result.error
          ? result.error
          : 'Labour.Group API request failed.'
      );
    }

    return result.data;
  }

  function createRunner() {
    let successHandler = function() {};
    let failureHandler = function(error) {
      console.error(error);
    };

    const runner = {
      withSuccessHandler(handler) {
        if (typeof handler === 'function') {
          successHandler = handler;
        }
        return proxy;
      },

      withFailureHandler(handler) {
        if (typeof handler === 'function') {
          failureHandler = handler;
        }
        return proxy;
      }
    };

    const proxy = new Proxy(runner, {
      get(target, property) {
        if (property in target) {
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        }

        return function(...args) {
          request(String(property), args)
            .then(successHandler)
            .catch(failureHandler);
        };
      }
    });

    return proxy;
  }

  return {
    request,
    get run() {
      return createRunner();
    }
  };
})();
