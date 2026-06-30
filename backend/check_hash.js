const bcrypt = require('bcryptjs');
bcrypt.compare("Admin@12345", "$2b$10$g0SxD/fOzxT.Zkv73/e.R.nMT/taZz2YD0O8qpEBvDsZJM06iwGlG").then(console.log);
