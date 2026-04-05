import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcrypt";
import db from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

// Navigation
const navigationLinks = [
  { label: 'About Us', href: '#about' },
  { label: 'Initiatives', href: '#initiatives' },
  { label: 'Bootcamps', href: '#bootcamps' },
];
const footerNavigation = [
  { label: 'Home', href: '/' },
  { label: 'Bootcamps', href: '#bootcamps' },
  { label: 'Initiatives', href: '#initiatives' },
  { label: 'About Us', href: '#about' },
];

// Social
const socialMediaLinks = [
  { platform: 'instagram', href: 'https://instagram.com/emprinte' },
  { platform: 'linkedin', href: 'https://linkedin.com/company/emprinte' },
  { platform: 'twitter', href: 'https://twitter.com/emprinte' },
];

// Contact
const contactInfo = {
  email: 'hello@emprintereaders.com',
  phone: [
    { label: 'Adepeju', number: '081029348475' },
    { label: 'Abiola', number: '081029348475' },
  ],
};

const settingsInsert = db.prepare(`
  INSERT OR REPLACE INTO settings (id, navigation_links, footer_navigation, social_media_links, contact_info)
  VALUES (1, ?, ?, ?, ?)
`);
settingsInsert.run(
  JSON.stringify(navigationLinks),
  JSON.stringify(footerNavigation),
  JSON.stringify(socialMediaLinks),
  JSON.stringify(contactInfo),
);

// Stats
const stats = [
  { value: '50+', label: 'Active Members', sort_order: 1 },
  { value: '156+', label: 'Book Reviews', sort_order: 2 },
  { value: '2000+', label: 'Beautiful Stories', sort_order: 3 },
];
db.exec('DELETE FROM stats');
const statsInsert = db.prepare(
  'INSERT INTO stats (value, label, sort_order) VALUES (?, ?, ?)',
);
stats.forEach((s) => statsInsert.run(s.value, s.label, s.sort_order));

// Book club hero
const bookClubHero = {
  badge: 'Book Club',
  title: 'Reading That Changes the World.',
  description:
    'Join a community of readers across Africa. Share stories, discover new books, and grow together.',
  button_text: 'Join Now',
};
db.prepare(
  `INSERT OR REPLACE INTO book_club_hero (id, badge, title, description, button_text) VALUES (1, ?, ?, ?, ?)`,
).run(
  bookClubHero.badge,
  bookClubHero.title,
  bookClubHero.description,
  bookClubHero.button_text,
);

// Build a reader
db.prepare(
  `INSERT OR REPLACE INTO build_a_reader (id, books_collected, total_books, price_per_book) VALUES (1, 119, 500, 2500)`,
).run();

// Sample insights (empty by default – add your own)
db.exec('DELETE FROM insight_articles');
const insightInsert = db.prepare(
  'INSERT INTO insight_articles (date, title, description, image, href) VALUES (?, ?, ?, ?, ?)',
);
insightInsert.run(
  'Friday, April 8, 2026',
  'Emprinte Insider: Our First Year',
  'A look back at our first year building a reading community across Africa.',
  'https://placehold.co/600x400/015B51/white?text=Emprinte',
  '/insights/1',
);

// Testimonials
db.exec('DELETE FROM testimonials');
const testimonialInsert = db.prepare(
  'INSERT INTO testimonials (text, name, title, rating, sort_order) VALUES (?, ?, ?, ?, ?)',
);
testimonialInsert.run(
  'Emprinte changed how I read. The community keeps me accountable and curious.',
  'Chinwe O.',
  'Active Member',
  5,
  1,
);
testimonialInsert.run(
  'The bootcamps opened my eyes to African literature I had never discovered.',
  'Kwame A.',
  'Bootcamp Graduate',
  5,
  2,
);

// Bootcamps
db.exec('DELETE FROM bootcamps');
const bootcampInsert = db.prepare(
  'INSERT INTO bootcamps (title, cohort, participants, background_color, sort_order) VALUES (?, ?, ?, ?, ?)',
);
bootcampInsert.run('Virtual Bootcamp I', 'Cohort I', '20+', 'bg-pink-200', 1);
bootcampInsert.run(
  'Virtual Bootcamp II',
  'Cohort II',
  '23+',
  'bg-yellow-200',
  2,
);
bootcampInsert.run(
  'Virtual Bootcamp III',
  'Cohort III',
  '8 20+',
  'bg-green-200',
  3,
);

const bootstrapEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const bootstrapPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD?.trim();
if (!bootstrapEmail || !bootstrapPassword) {
  console.log(
    'Admin bootstrap skipped: set INITIAL_SUPER_ADMIN_EMAIL and INITIAL_SUPER_ADMIN_PASSWORD in .env (both required, no defaults).',
  );
} else {
  const existing = db
    .prepare('SELECT id FROM admins WHERE lower(email) = lower(?)')
    .get(bootstrapEmail) as { id: number } | undefined;
  if (!existing) {
    const hash = bcrypt.hashSync(bootstrapPassword, 10);
    db.prepare(
      "INSERT INTO admins (email, password_hash, role) VALUES (?, ?, 'super_admin')",
    ).run(bootstrapEmail, hash);
    console.log('Super admin created:', bootstrapEmail);
  }
}

console.log('Seed completed. Database ready.');
