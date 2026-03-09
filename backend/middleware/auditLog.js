const { getDb } = require('../db/init');

// Auto-log write actions to audit_log
function auditLog(action) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode < 400 && req.user) {
        try {
          getDb().prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
            req.user.id, action, JSON.stringify({ params: req.params, body: req.body })
          );
        } catch (e) { /* ignore audit errors */ }
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = auditLog;
