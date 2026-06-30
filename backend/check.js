const prisma = require('./src/config/prisma');
prisma.user.findFirst({ where: { email: 'admin@2factor.local' } }).then(u => {
  console.log(u);
  prisma.$disconnect();
});
