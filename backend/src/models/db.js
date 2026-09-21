const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

async function initDB() {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL...');
    await client.query(`
      -- ---- SOCIETIES ----
      CREATE TABLE IF NOT EXISTS societies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        area VARCHAR(100) NOT NULL,
        city VARCHAR(80) DEFAULT 'Hyderabad',
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','launching','inactive')),
        delivery_slot TIME DEFAULT '06:00:00',
        pin_codes TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ---- USERS ----
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        phone VARCHAR(15) UNIQUE,
        password_hash VARCHAR(255),
        google_id VARCHAR(100),
        society_id INT REFERENCES societies(id),
        tower VARCHAR(60),
        apt_number VARCHAR(30),
        role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer','admin','delivery')),
        is_verified BOOLEAN DEFAULT FALSE,
        refresh_token TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ---- PRODUCT CATEGORIES ----
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(60) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(10),
        color VARCHAR(30),
        sort_order INT DEFAULT 0
      );

      -- ---- PRODUCTS ----
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        category_id INT REFERENCES categories(id),
        name VARCHAR(150) NOT NULL,
        name_telugu VARCHAR(150),
        slug VARCHAR(150) UNIQUE NOT NULL,
        description TEXT,
        base_unit VARCHAR(20) DEFAULT '50g',
        price_per_unit NUMERIC(8,2) NOT NULL,
        min_qty NUMERIC(8,2) DEFAULT 50,
        step_qty NUMERIC(8,2) DEFAULT 50,
        max_qty NUMERIC(8,2) DEFAULT 2000,
        unit_label VARCHAR(30) DEFAULT 'grams',
        is_by_weight BOOLEAN DEFAULT TRUE,
        is_per_piece BOOLEAN DEFAULT FALSE,
        image_emoji VARCHAR(10),
        in_stock BOOLEAN DEFAULT TRUE,
        is_seasonal BOOLEAN DEFAULT FALSE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ---- PACKAGES ----
      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(80) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
        price NUMERIC(8,2) NOT NULL,
        original_price NUMERIC(8,2),
        delivery_free BOOLEAN DEFAULT TRUE,
        badge VARCHAR(60),
        icon VARCHAR(10),
        color_scheme VARCHAR(30),
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ---- PACKAGE ITEMS ----
      CREATE TABLE IF NOT EXISTS package_items (
        id SERIAL PRIMARY KEY,
        package_id INT REFERENCES packages(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id),
        qty NUMERIC(8,2) NOT NULL,
        unit_label VARCHAR(30)
      );

      -- ---- SUBSCRIPTIONS ----
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        package_id INT REFERENCES packages(id),
        custom_items JSONB,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        next_delivery DATE,
        pause_until DATE,
        delivery_notes TEXT,
        monthly_price NUMERIC(8,2),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ---- ORDERS ----
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        subscription_id INT REFERENCES subscriptions(id),
        order_type VARCHAR(20) DEFAULT 'one_off' CHECK (order_type IN ('one_off','subscription','event')),
        status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','out_for_delivery','delivered','cancelled')),
        payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
        payment_method VARCHAR(30),
        razorpay_order_id VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        subtotal NUMERIC(8,2) NOT NULL,
        delivery_charge NUMERIC(8,2) DEFAULT 0,
        discount NUMERIC(8,2) DEFAULT 0,
        total NUMERIC(8,2) NOT NULL,
        delivery_address JSONB,
        delivery_date DATE,
        delivery_slot VARCHAR(20),
        special_instructions TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ---- ORDER ITEMS ----
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id),
        product_name VARCHAR(150),
        qty NUMERIC(8,2),
        unit_label VARCHAR(30),
        unit_price NUMERIC(8,2),
        line_total NUMERIC(8,2)
      );

      -- ---- AREA SERVICE ZONES ----
      CREATE TABLE IF NOT EXISTS service_zones (
        id SERIAL PRIMARY KEY,
        area_name VARCHAR(100) NOT NULL,
        pin_code VARCHAR(10),
        is_active BOOLEAN DEFAULT TRUE,
        delivery_charge NUMERIC(6,2) DEFAULT 40.00,
        free_delivery_threshold NUMERIC(8,2) DEFAULT 0
      );

      -- ---- SOCIETY NOMINATIONS ----
      CREATE TABLE IF NOT EXISTS society_nominations (
        id SERIAL PRIMARY KEY,
        society_name VARCHAR(150) NOT NULL,
        area VARCHAR(100),
        pin_code VARCHAR(10),
        nominator_name VARCHAR(100),
        nominator_phone VARCHAR(15),
        nominator_email VARCHAR(150),
        vote_count INT DEFAULT 1,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ---- CONTACT ENQUIRIES ----
      CREATE TABLE IF NOT EXISTS contact_enquiries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150),
        phone VARCHAR(15),
        enquiry_type VARCHAR(50),
        message TEXT,
        status VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed categories
    await client.query(`
      INSERT INTO categories (slug, name, icon, color, sort_order) VALUES
        ('fresh-flowers',   'Fresh Flowers',      '🌸', 'rose',    1),
        ('pooja-essentials','Pooja Essentials',   '🪔', 'saffron', 2),
        ('garlands',        'Garlands & Strings', '💐', 'sage',    3),
        ('bundles',         'Ready Bundles',      '📦', 'blush',   4)
      ON CONFLICT (slug) DO NOTHING;
    `);

    // Seed service zones (Hyderabad: Uppal to Shamshabad belt)
    await client.query(`
      INSERT INTO service_zones (area_name, pin_code, is_active, delivery_charge) VALUES
        ('Uppal',           '500039', true, 40),
        ('Nagole',          '500035', true, 40),
        ('LB Nagar',        '500035', true, 40),
        ('Vanasthalipuram', '500070', true, 40),
        ('Hayathnagar',     '500016', true, 40),
        ('Saroornagar',     '500035', true, 40),
        ('Kothapet',        '500035', true, 40),
        ('Dilsukhnagar',    '500036', true, 40),
        ('Moosarambagh',    '500036', true, 40),
        ('Malakpet',        '500036', true, 40),
        ('Mehdipatnam',     '500028', true, 40),
        ('Attapur',         '500048', true, 40),
        ('Rajendranagar',   '500052', true, 40),
        ('Shamshabad',      '501218', true, 40),
        ('Balapur',         '500005', true, 40),
        ('Nacharam',        '500076', true, 40)
      ON CONFLICT DO NOTHING;
    `);

    // Seed societies (Hyderabad gated communities)
    await client.query(`
      INSERT INTO societies (name, area, status, delivery_slot, pin_codes) VALUES
        ('Aparna Sarovar',        'Nagole',           'active',    '06:00', ARRAY['500035']),
        ('NSL Nakshatra',         'Uppal',            'active',    '06:15', ARRAY['500039']),
        ('Hallmark Sathvika',     'Uppal',            'active',    '06:10', ARRAY['500039']),
        ('Sri Aditya Windsor',    'LB Nagar',         'active',    '06:30', ARRAY['500035']),
        ('Vasavi MPM Grand',      'Vanasthalipuram',  'active',    '06:20', ARRAY['500070']),
        ('Aparna Serene Park',    'Nallagandla',      'active',    '06:00', ARRAY['500019']),
        ('Fortune Grandiose',     'Rajendranagar',    'active',    '06:30', ARRAY['500052']),
        ('Rainbow Vistas',        'Attapur',          'active',    '06:25', ARRAY['500048']),
        ('Keerthi Estates',       'Uppal',            'launching', '07:00', ARRAY['500039']),
        ('Prestige High Fields',  'Gachibowli',       'launching', '06:00', ARRAY['500032']),
        ('My Home Bhooja',        'Gachibowli',       'active',    '06:00', ARRAY['500032']),
        ('Cybercity Apts',        'LB Nagar',         'launching', '06:30', ARRAY['500035'])
      ON CONFLICT DO NOTHING;
    `);

    // Seed products
    await client.query(`
      INSERT INTO products (category_id, name, name_telugu, slug, description, price_per_unit, min_qty, step_qty, max_qty, unit_label, is_by_weight, image_emoji, sort_order) VALUES
        (1, 'Rose (Gulab)',          'గులాబీ',      'rose',           'Fresh red/pink roses. Perfect for mandir & pooja.', 0.60, 50, 50, 2000, 'g', true, '🌹', 1),
        (1, 'Jasmine Banti (Mogra)', 'మొగర',        'jasmine-banti',  'Fragrant white mogra, ideal for hair & pooja.', 0.50, 50, 50, 2000, 'g', true, '🤍', 2),
        (1, 'Chamanti (Chrysanthemum)','చామంతి',   'chamanti',       'Fresh yellow/white chamanti. Daily pooja staple.', 0.30, 50, 50, 2000, 'g', true, '🌼', 3),
        (1, 'Genda (Marigold)',      'బంతి',        'genda-marigold', 'Bright orange & yellow marigold. Festival favorite.', 0.22, 50, 50, 5000, 'g', true, '🟡', 4),
        (1, 'Kanakambaram',         'కనకాంబరం',   'kanakambaram',   'Bright orange kanakambaram. Highly fragrant.', 0.70, 50, 50, 2000, 'g', true, '🟠', 5),
        (1, 'Tuberose (Sugandhrajam)','సుగంధరాజం','tuberose',        'Tall white tuberose. Heavenly fragrance.', 0.40, 50, 50, 2000, 'g', true, '🕊️', 6),
        (1, 'Lotus (Kamal)',         'కమలం',       'lotus',          'Sacred pink lotus. Auspicious for all poojas.', 15.00, 1, 1, 50, 'piece', false, '🪷', 7),
        (1, 'Lily',                  'లిల్లీ',      'lily',           'Exotic white lilies. Great for home decor.', 12.00, 1, 1, 20, 'piece', false, '🌷', 8),
        (1, 'Gerbera',               'జర్బెరా',     'gerbera',        'Vibrant gerberas in mixed colours.', 8.00, 1, 1, 50, 'piece', false, '🌸', 9),

        (2, 'Coconut (Kobbari)',    'కొబ్బరికాయ',  'coconut',        'Fresh whole coconut. Essential for all rituals.', 20.00, 1, 1, 20, 'piece', false, '🥥', 1),
        (2, 'Agarbatti (Incense)',  'అగరబత్తి',   'agarbatti',      'Premium flora incense sticks (20 sticks/pack).', 25.00, 1, 1, 10, 'pack', false, '🕯️', 2),
        (2, 'Camphor (Kapoor)',     'కర్పూరం',     'camphor',        'Pure camphor tablets (10 tablets/pack).', 15.00, 1, 1, 10, 'pack', false, '⚪', 3),
        (2, 'Turmeric Powder',      'పసుపు',       'turmeric',       'Pure haldi/turmeric powder (100g pack).', 20.00, 1, 1, 10, 'pack', false, '🟡', 4),
        (2, 'Kumkum (Sindoor)',     'కుంకుమ',      'kumkum',         'Auspicious red kumkum (20g pack).', 10.00, 1, 1, 10, 'pack', false, '🔴', 5),
        (2, 'Mango Leaves (Bunch)', 'మామిడి ఆకులు','mango-leaves',   'Fresh mango leaves — 12 leaves/bunch.', 10.00, 1, 1, 10, 'bunch', false, '🌿', 6),
        (2, 'Banana Leaf',          'అరటి ఆకు',   'banana-leaf',    'Fresh banana leaf. Used in rituals & prasad serving.', 5.00, 1, 1, 10, 'piece', false, '🍃', 7),
        (2, 'Doob Grass (Durva)',   'గరిక',        'doob-grass',     'Fresh durva grass (50g). For Ganesha pooja.', 15.00, 1, 1, 10, '50g', false, '🌱', 8),

        (3, 'Marigold Garland (Stitched)', 'గెండాపూల దండ', 'marigold-garland', 'Hand-stitched fresh marigold garland (per foot).', 15.00, 1, 1, 50, 'foot', false, '🔆', 1),
        (3, 'Jasmine String Garland (Veni)', 'మొగర వేణి', 'jasmine-garland', 'Traditional jasmine veni (per foot). Fragrant & fresh.', 25.00, 1, 1, 20, 'foot', false, '🤍', 2),
        (3, 'Mixed Flower Garland', 'మిశ్రమ దండ',  'mixed-garland',  'Rose + chamanti + marigold garland (per foot).', 20.00, 1, 1, 50, 'foot', false, '🌺', 3),
        (3, 'Door Toran (Mango Leaf + Flowers)', 'తోరణం', 'door-toran', 'Auspicious door toran: mango leaves + genda (per foot).', 30.00, 3, 1, 20, 'foot', false, '🎋', 4)
      ON CONFLICT (slug) DO NOTHING;
    `);

    // Seed Packages
    await client.query(`
      INSERT INTO packages (slug, name, description, frequency, price, original_price, delivery_free, badge, icon, color_scheme, sort_order) VALUES
        ('daily-starter',   'Daily Starter',
         'Perfect for your daily mandir. 50g mixed blooms (rose, banti, chamanti) + 1 coconut + agarbatti. Delivered at 6 AM.',
         'daily', 49, 65, true, 'Most Popular', '🌅', 'rose', 1),

        ('daily-premium',   'Daily Premium',
         '100g premium mixed flowers (rose, kanakambaram, chamanti, genda) + coconut + agarbatti + camphor. For complete daily ritual.',
         'daily', 79, 99, true, 'Best Value', '✨', 'saffron', 2),

        ('weekly-pooja',    'Weekly Pooja Pack',
         '500g mixed flowers + 4 coconuts + agarbatti (7 packs) + camphor + turmeric. Weekly doorstep, every Friday.',
         'weekly', 299, 380, true, 'Save 21%', '📅', 'sage', 3),

        ('weekly-premium',  'Weekly Premium',
         '750g premium blooms (rose, kanakambaram, tuberose, lotus) + complete pooja kit + door toran. Premium weekly ritual.',
         'weekly', 499, 649, true, 'Premium', '👑', 'sage', 4),

        ('monthly-saver',   'Monthly Saver',
         '2kg mixed flowers + all pooja essentials for the month. Best price per gram. Free delivery all month.',
         'monthly', 999, 1399, true, 'Best Price', '🏷️', 'rose', 5),

        ('monthly-grand',   'Monthly Grand',
         '3kg premium blooms + complete monthly pooja kit + festival special flowers on auspicious days.',
         'monthly', 1499, 1999, true, 'Grand Value', '🌺', 'saffron', 6)
      ON CONFLICT (slug) DO NOTHING;
    `);

    // Seed default admin account
    const adminPassHash = await bcrypt.hash('Admin@FreshPetal2026', 10);
    await client.query(`
      INSERT INTO users (name, email, phone, password_hash, role, is_verified)
      VALUES ('FreshPetal Operations Admin', 'admin@freshpetal.in', '9000000001', $1, 'admin', TRUE)
      ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = $1;
    `, [adminPassHash]);

    console.log('✅ Database initialized & seeded successfully (including admin@freshpetal.in).\n');
  } catch (err) {
    console.error('❌ DB Init Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
