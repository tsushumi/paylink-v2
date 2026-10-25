const prisma = require('../lib/prisma');
const { verify } = require('../lib/jwt');

/** Requires `Authorization: Bearer <jwt>`; attaches the merchant to req.user. */
async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const userId = verify(token);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireUser };
