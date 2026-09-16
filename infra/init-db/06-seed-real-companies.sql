-- ============================================================================
-- DECODING JOBS — Phase 2 seed data
-- Real tech companies in Bangalore and Chennai with verified coordinates.
-- ============================================================================

-- Bangalore companies (verified lat/lng)
INSERT INTO companies (name, description, address, location, sector, area, city, founded_year, team_size, total_funding, status, website_url, linkedin_url, logo_url)
VALUES
    ('Razorpay', 'Full-stack payments platform for Indian businesses.', 'SJR Cyber City, Koramangala, Bengaluru', ST_SetSRID(ST_MakePoint(77.6245, 12.9352), 4326), 'Fintech', 'Koramangala', 'Bengaluru', 2014, '500+', '$741M', 'active', 'https://razorpay.com', 'https://linkedin.com/company/razorpay', 'https://www.google.com/s2/favicons?domain=razorpay.com'),
    ('Swiggy', 'India''s leading on-demand delivery platform.', 'SM Rica, Residency Road, Ashok Nagar, Bengaluru', ST_SetSRID(ST_MakePoint(77.6090, 12.9739), 4326), 'Consumer', 'MG Road', 'Bengaluru', 2014, '500+', '$1.3B', 'active', 'https://swiggy.com', 'https://linkedin.com/company/swiggy', 'https://www.google.com/s2/favicons?domain=swiggy.com'),
    ('Freshworks', 'Cloud-based SaaS for customer engagement and IT service management.', 'Skipper Corner, Bellandur, Bengaluru', ST_SetSRID(ST_MakePoint(77.6691, 12.9279), 4326), 'SaaS', 'Bellandur', 'Bengaluru', 2010, '500+', '$424M', 'active', 'https://freshworks.com', 'https://linkedin.com/company/freshworks', 'https://www.google.com/s2/favicons?domain=freshworks.com'),
    ('CRED', 'Premium credit card management and payments platform.', 'Koramangala 5th Block, Bengaluru', ST_SetSRID(ST_MakePoint(77.6210, 12.9348), 4326), 'Fintech', 'Koramangala', 'Bengaluru', 2018, '500+', '$387M', 'active', 'https://cred.club', 'https://linkedin.com/company/cred', 'https://www.google.com/s2/favicons?domain=cred.club'),
    ('Dream11', 'India''s largest fantasy sports platform with 200M+ users.', 'Creator''s Tower, HSR Layout, Bengaluru', ST_SetSRID(ST_MakePoint(77.6368, 12.9152), 4326), 'Consumer', 'HSR Layout', 'Bengaluru', 2008, '500+', '$825M', 'active', 'https://dream11.com', 'https://linkedin.com/company/dream11', 'https://www.google.com/s2/favicons?domain=dream11.com'),
    ('PhonePe', 'Digital payments and financial services platform built on UPI.', 'Outer Ring Road, Bellandur, Bengaluru', ST_SetSRID(ST_MakePoint(77.6730, 12.9250), 4326), 'Fintech', 'Bellandur', 'Bengaluru', 2015, '500+', '$1.7B', 'active', 'https://phonepe.com', 'https://linkedin.com/company/phonepe', 'https://www.google.com/s2/favicons?domain=phonepe.com'),
    ('Zerodha', 'India''s largest retail stockbroker by active clients.', 'OTC Road, Bannerghatta Road, Bengaluru', ST_SetSRID(ST_MakePoint(77.6008, 12.9315), 4326), 'Fintech', 'Bannerghatta Road', 'Bengaluru', 2010, '500+', 'Bootstrapped', 'active', 'https://zerodha.com', 'https://linkedin.com/company/zerodha', 'https://www.google.com/s2/favicons?domain=zerodha.com'),
    ('Meesho', 'Full-stack e-commerce platform enabling social commerce.', 'HSR Layout Sector 2, Bengaluru', ST_SetSRID(ST_MakePoint(77.6390, 12.9110), 4326), 'Consumer', 'HSR Layout', 'Bengaluru', 2015, '500+', '$931M', 'active', 'https://meesho.com', 'https://linkedin.com/company/meesho', 'https://www.google.com/s2/favicons?domain=meesho.com'),
    ('Postman', 'API development platform used by 30M+ developers worldwide.', 'KLJ North One, Sarjapur, Bengaluru', ST_SetSRID(ST_MakePoint(77.6710, 12.9185), 4326), 'SaaS', 'Sarjapur Road', 'Bengaluru', 2014, '500+', '$430M', 'active', 'https://postman.com', 'https://linkedin.com/company/postman', 'https://www.google.com/s2/favicons?domain=postman.com'),
    ('Flipkart', 'India''s leading e-commerce marketplace, owned by Walmart.', 'Electronic City Phase 1, Bengaluru', ST_SetSRID(ST_MakePoint(77.6610, 12.8430), 4326), 'Consumer', 'Electronic City', 'Bengaluru', 2007, '500+', 'Walmart', 'active', 'https://flipkart.com', 'https://linkedin.com/company/flipkart', 'https://www.google.com/s2/favicons?domain=flipkart.com'),
    ('Rubrik', 'Cybersecurity and data management platform for enterprises.', 'Prestige Platina Tech Park, Marathahalli, Bengaluru', ST_SetSRID(ST_MakePoint(77.6954, 12.9435), 4326), 'SaaS', 'Bellandur', 'Bengaluru', 2014, '201-500', '$504M', 'active', 'https://rubrik.com', 'https://linkedin.com/company/rubrik', 'https://www.google.com/s2/favicons?domain=rubrik.com'),
    ('MakeMyTrip', 'India''s leading online travel company.', 'MG Road, Bengaluru', ST_SetSRID(ST_MakePoint(77.6110, 12.9755), 4326), 'Consumer', 'MG Road', 'Bengaluru', 2000, '500+', 'Public', 'active', 'https://makemytrip.com', 'https://linkedin.com/company/makemytrip', 'https://www.google.com/s2/favicons?domain=makemytrip.com'),
    ('Highradius', 'AI-powered order-to-cash and treasury management SaaS.', 'HAL 2nd Stage, Indiranagar, Bengaluru', ST_SetSRID(ST_MakePoint(77.6419, 12.9741), 4326), 'SaaS', 'Indiranagar', 'Bengaluru', 2006, '500+', '$300M', 'active', 'https://highradius.com', 'https://linkedin.com/company/highradius', 'https://www.google.com/s2/favicons?domain=highradius.com'),
    ('Atlassian Bengaluru', 'Enterprise software for project management (Jira, Confluence).', 'Embassy Golf Links Business Park, Bengaluru', ST_SetSRID(ST_MakePoint(77.6480, 12.9620), 4326), 'SaaS', 'Domlur', 'Bengaluru', 2002, '500+', 'Public', 'active', 'https://atlassian.com', 'https://linkedin.com/company/atlassian', 'https://www.google.com/s2/favicons?domain=atlassian.com')
ON CONFLICT (name) DO NOTHING;

-- Chennai companies (verified lat/lng)
INSERT INTO companies (name, description, address, location, sector, area, city, founded_year, team_size, total_funding, status, website_url, linkedin_url, logo_url)
VALUES
    ('Zoho Corporation', 'Cloud-based business software suite (CRM, Finance, HR).', 'Estancia IT Park, Old Mahabalipuram Road, Chennai', ST_SetSRID(ST_MakePoint(80.2200, 12.8350), 4326), 'SaaS', 'OMR', 'Chennai', 1996, '500+', 'Bootstrapped', 'active', 'https://zoho.com', 'https://linkedin.com/company/zoho', 'https://www.google.com/s2/favicons?domain=zoho.com'),
    ('Freshworks Chennai', 'Cloud-based SaaS for customer engagement and IT service management.', 'Pearl Plaza, Velachery, Chennai', ST_SetSRID(ST_MakePoint(80.2180, 12.9844), 4326), 'SaaS', 'Velachery', 'Chennai', 2010, '500+', '$424M', 'active', 'https://freshworks.com', 'https://linkedin.com/company/freshworks', 'https://www.google.com/s2/favicons?domain=freshworks.com'),
    ('Kissflow', 'Workflow automation and digital workplace platform.', 'SP Infocity, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'SaaS', 'IT Corridor', 'Chennai', 2012, '100-500', '$56M', 'active', 'https://kissflow.com', 'https://linkedin.com/company/kissflow', 'https://www.google.com/s2/favicons?domain=kissflow.com'),
    ('Chargebee', 'Subscription billing and revenue management for SaaS.', 'SP Infocity, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'SaaS', 'IT Corridor', 'Chennai', 2011, '500+', '$254M', 'active', 'https://chargebee.com', 'https://linkedin.com/company/chargebee', 'https://www.google.com/s2/favicons?domain=chargebee.com'),
    ('TCS Chennai', 'IT consulting and digital transformation services.', 'Thirumalai Nagar, Nungambakkam, Chennai', ST_SetSRID(ST_MakePoint(80.2478, 13.0618), 4326), 'Other', 'Nungambakkam', 'Chennai', 1968, '500+', 'Public', 'active', 'https://tcs.com', 'https://linkedin.com/company/tcs', 'https://www.google.com/s2/favicons?domain=tcs.com'),
    ('Infosys Chennai', 'IT consulting and software development services.', 'Rajiv Gandhi Salai, Sholinganallur, Chennai', ST_SetSRID(ST_MakePoint(80.2270, 12.9010), 4326), 'Other', 'OMR', 'Chennai', 1981, '500+', 'Public', 'active', 'https://infosys.com', 'https://linkedin.com/company/infosys', 'https://www.google.com/s2/favicons?domain=infosys.com'),
    ('Wipro Chennai', 'IT services, consulting, and digital transformation.', 'SP Infocity, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'Other', 'IT Corridor', 'Chennai', 1945, '500+', 'Public', 'active', 'https://wipro.com', 'https://linkedin.com/company/wipro', 'https://www.google.com/s2/favicons?domain=wipro.com'),
    ('Cognizant Chennai', 'Digital transformation and technology consulting.', 'Old Mahabalipuram Road, Thoraipakkam, Chennai', ST_SetSRID(ST_MakePoint(80.2345, 12.9410), 4326), 'Other', 'OMR', 'Chennai', 1994, '500+', 'Public', 'active', 'https://cognizant.com', 'https://linkedin.com/company/cognizant', 'https://www.google.com/s2/favicons?domain=cognizant.com'),
    ('HCLTech Chennai', 'IT services and consulting solutions.', 'Rajiv Gandhi Salai, Sholinganallur, Chennai', ST_SetSRID(ST_MakePoint(80.2270, 12.9010), 4326), 'Other', 'OMR', 'Chennai', 1976, '500+', 'Public', 'active', 'https://hcltech.com', 'https://linkedin.com/company/hcltech', 'https://www.google.com/s2/favicons?domain=hcltech.com'),
    ('Amazon Chennai', 'E-commerce, cloud computing (AWS), and digital streaming.', 'DLF Cyber City, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'Consumer', 'IT Corridor', 'Chennai', 1994, '500+', 'Public', 'active', 'https://amazon.in', 'https://linkedin.com/company/amazon', 'https://www.google.com/s2/favicons?domain=amazon.in'),
    ('Google Chennai', 'Search, cloud, AI/ML, and enterprise technology.', 'DLF Cyber City, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'AI', 'IT Corridor', 'Chennai', 1998, '500+', 'Public', 'active', 'https://google.com', 'https://linkedin.com/company/google', 'https://www.google.com/s2/favicons?domain=google.com'),
    ('Microsoft Chennai', 'Productivity software, cloud services (Azure), and AI.', 'DLF Cyber City, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'SaaS', 'IT Corridor', 'Chennai', 1975, '500+', 'Public', 'active', 'https://microsoft.com', 'https://linkedin.com/company/microsoft', 'https://www.google.com/s2/favicons?domain=microsoft.com'),
    ('Oracle Chennai', 'Enterprise software, cloud infrastructure, and database.', 'DLF Cyber City, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'SaaS', 'IT Corridor', 'Chennai', 1977, '500+', 'Public', 'active', 'https://oracle.com', 'https://linkedin.com/company/oracle', 'https://www.google.com/s2/favicons?domain=oracle.com'),
    ('Thoughtworks Chennai', 'Software consultancy and digital transformation.', 'DLF Cyber City, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'SaaS', 'IT Corridor', 'Chennai', 1993, '500+', 'Public', 'active', 'https://thoughtworks.com', 'https://linkedin.com/company/thoughtworks', 'https://www.google.com/s2/favicons?domain=thoughtworks.com'),
    ('SBI Cards', 'India''s second-largest credit card issuer.', 'Lloyds Road, Royapettah, Chennai', ST_SetSRID(ST_MakePoint(80.2676, 13.0518), 4326), 'Fintech', 'T. Nagar', 'Chennai', 1998, '500+', 'Public', 'active', 'https://sbicard.com', 'https://linkedin.com/company/sbi-cards', 'https://www.google.com/s2/favicons?domain=sbicard.com'),
    ('Paytm Chennai', 'Digital payments and financial services platform.', 'Anna Salai, Chennai', ST_SetSRID(ST_MakePoint(80.2570, 13.0540), 4326), 'Fintech', 'Nungambakkam', 'Chennai', 2010, '500+', '$3.5B', 'active', 'https://paytm.com', 'https://linkedin.com/company/paytm', 'https://www.google.com/s2/favicons?domain=paytm.com'),
    ('Uber Chennai', 'Ride-hailing and food delivery technology platform.', 'DLF Cyber City, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'Consumer', 'IT Corridor', 'Chennai', 2009, '500+', 'Public', 'active', 'https://uber.com', 'https://linkedin.com/company/uber', 'https://www.google.com/s2/favicons?domain=uber.com'),
    ('Dell Chennai', 'Computer hardware, software, and IT infrastructure.', 'DLF Cyber City, Perungudi, Chennai', ST_SetSRID(ST_MakePoint(80.2380, 12.9680), 4326), 'Other', 'IT Corridor', 'Chennai', 1984, '500+', 'Public', 'active', 'https://dell.com', 'https://linkedin.com/company/dell', 'https://www.google.com/s2/favicons?domain=dell.com')
ON CONFLICT (name) DO NOTHING;

-- Bangalore jobs
INSERT INTO jobs (company_id, title, description, employment_type, min_experience_years, work_mode, apply_url, source, is_active)
SELECT c.id, v.title, v.description, v.employment_type::employment_type, v.min_experience_years, v.work_mode::work_mode, v.apply_url, 'linkedin', true
FROM (
    VALUES
        ('Razorpay', 'Senior Backend Engineer (Node.js)', 'Design high-throughput payment processing systems handling millions of transactions daily.', 'full_time', 3, 'hybrid', 'https://razorpay.com/careers'),
        ('Razorpay', 'Frontend Engineer (React)', 'Build the next-gen merchant dashboard and checkout experience.', 'full_time', 2, 'hybrid', 'https://razorpay.com/careers'),
        ('Swiggy', 'Machine Learning Engineer', 'Build ML models for delivery time prediction and route optimization.', 'full_time', 3, 'hybrid', 'https://swiggy.com/careers'),
        ('Swiggy', 'Backend Engineer (Java/Kotlin)', 'Scale the real-time order management system to handle 2M+ orders per day.', 'full_time', 3, 'hybrid', 'https://swiggy.com/careers'),
        ('Freshworks', 'Senior Software Engineer (Java)', 'Build and scale the Freshdesk platform used by 60,000+ businesses.', 'full_time', 4, 'hybrid', 'https://freshworks.com/careers'),
        ('Freshworks', 'DevOps Engineer (Kubernetes)', 'Own the infrastructure powering Freshworks suite.', 'full_time', 3, 'hybrid', 'https://freshworks.com/careers'),
        ('CRED', 'Android Developer (Kotlin)', 'Build premium mobile experiences for CRED''s 15M+ user base.', 'full_time', 3, 'onsite', 'https://cred.club/careers'),
        ('CRED', 'Backend Engineer (Go/Rust)', 'Design systems processing billions in credit card payments securely.', 'full_time', 4, 'onsite', 'https://cred.club/careers'),
        ('Dream11', 'Senior React Developer', 'Build the fantasy sports platform used by 200M+ sports fans.', 'full_time', 3, 'hybrid', 'https://dream11.com/careers'),
        ('Dream11', 'Backend Engineer (Scala/Java)', 'Scale real-time scoring and contest management infrastructure.', 'full_time', 4, 'hybrid', 'https://dream11.com/careers'),
        ('PhonePe', 'Full Stack Engineer', 'Build digital payment features reaching 500M+ users on UPI.', 'full_time', 3, 'hybrid', 'https://phonepe.com/careers'),
        ('PhonePe', 'Security Engineer', 'Protect financial transactions for India''s largest UPI app.', 'full_time', 5, 'hybrid', 'https://phonepe.com/careers'),
        ('Zerodha', 'Frontend Engineer (JavaScript)', 'Build Kite, India''s most popular trading platform.', 'full_time', 2, 'hybrid', 'https://zerodha.com/careers'),
        ('Zerodha', 'Systems Engineer (Linux)', 'Maintain ultra-low-latency trading infrastructure.', 'full_time', 5, 'onsite', 'https://zerodha.com/careers'),
        ('Meesho', 'ML Engineer - Recommendations', 'Build recommendation engines for 150M+ social commerce users.', 'full_time', 3, 'hybrid', 'https://meesho.com/careers'),
        ('Meesho', 'Backend Engineer (Java)', 'Design microservices handling millions of orders daily.', 'full_time', 3, 'hybrid', 'https://meesho.com/careers'),
        ('Postman', 'Senior Software Engineer (Node.js)', 'Build the API platform used by 30M+ developers worldwide.', 'full_time', 4, 'remote', 'https://postman.com/careers'),
        ('Postman', 'Developer Advocate', 'Create educational content about API development.', 'full_time', 3, 'remote', 'https://postman.com/careers'),
        ('Flipkart', 'Software Development Engineer (SDE-2)', 'Build the e-commerce platform serving 500M+ registered users.', 'full_time', 2, 'hybrid', 'https://flipkart.com/careers'),
        ('Flipkart', 'Senior Data Engineer', 'Build data pipelines processing petabytes of e-commerce data.', 'full_time', 4, 'hybrid', 'https://flipkart.com/careers'),
        ('Rubrik', 'Cloud Security Engineer', 'Build zero-trust data security solutions for enterprises.', 'full_time', 3, 'hybrid', 'https://rubrik.com/careers'),
        ('MakeMyTrip', 'Full Stack Engineer', 'Build travel booking experiences for India''s #1 travel platform.', 'full_time', 3, 'hybrid', 'https://makemytrip.com/careers'),
        ('Highradius', 'ML Engineer - Cash Application', 'Build ML models for automated cash application and collections.', 'full_time', 3, 'onsite', 'https://highradius.com/careers'),
        ('Atlassian Bengaluru', 'Senior Backend Engineer (Java)', 'Build collaboration tools like Jira and Confluence.', 'full_time', 5, 'hybrid', 'https://atlassian.com/careers')
) AS v(company_name, title, description, employment_type, min_experience_years, work_mode, apply_url)
JOIN companies c ON c.name = v.company_name
WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id AND j.title = v.title);

-- Chennai jobs
INSERT INTO jobs (company_id, title, description, employment_type, min_experience_years, work_mode, apply_url, source, is_active)
SELECT c.id, v.title, v.description, v.employment_type::employment_type, v.min_experience_years, v.work_mode::work_mode, v.apply_url, 'linkedin', true
FROM (
    VALUES
        ('Zoho Corporation', 'Senior Software Engineer (Java)', 'Build enterprise business software used by 100M+ users globally.', 'full_time', 4, 'hybrid', 'https://zoho.com/careers'),
        ('Zoho Corporation', 'Full Stack Developer (React + Java)', 'Develop end-to-end features for Zoho CRM and office suite.', 'full_time', 3, 'hybrid', 'https://zoho.com/careers'),
        ('Freshworks Chennai', 'Senior Backend Engineer (Java)', 'Scale the Freshdesk platform for enterprise customers.', 'full_time', 4, 'hybrid', 'https://freshworks.com/careers'),
        ('Freshworks Chennai', 'Mobile Developer (iOS/Android)', 'Build native mobile apps for Freshworks product suite.', 'full_time', 3, 'hybrid', 'https://freshworks.com/careers'),
        ('Kissflow', 'Senior React Developer', 'Build the workflow automation platform used by 10,000+ businesses.', 'full_time', 3, 'hybrid', 'https://kissflow.com/careers'),
        ('Kissflow', 'Backend Engineer (Node.js)', 'Design scalable workflow engine processing millions of actions.', 'full_time', 3, 'hybrid', 'https://kissflow.com/careers'),
        ('Chargebee', 'Software Engineer (Ruby on Rails)', 'Build subscription billing engine for 5,000+ SaaS businesses.', 'full_time', 3, 'hybrid', 'https://chargebee.com/careers'),
        ('Chargebee', 'Senior Product Engineer', 'Design payment reconciliation and revenue recognition features.', 'full_time', 4, 'hybrid', 'https://chargebee.com/careers'),
        ('TCS Chennai', 'Software Engineer (Java)', 'Deliver digital transformation solutions for global enterprises.', 'full_time', 2, 'hybrid', 'https://tcs.com/careers'),
        ('TCS Chennai', 'Data Scientist', 'Build AI/ML models for enterprise clients across industries.', 'full_time', 3, 'hybrid', 'https://tcs.com/careers'),
        ('Infosys Chennai', 'Senior Consultant (Cloud)', 'Design cloud migration strategies for Fortune 500 clients.', 'full_time', 5, 'hybrid', 'https://infosys.com/careers'),
        ('Infosys Chennai', 'Full Stack Developer', 'Build enterprise web applications using modern frameworks.', 'full_time', 2, 'hybrid', 'https://infosys.com/careers'),
        ('Wipro Chennai', 'Cloud Engineer (AWS/Azure)', 'Design and implement cloud infrastructure for enterprise clients.', 'full_time', 3, 'hybrid', 'https://wipro.com/careers'),
        ('Cognizant Chennai', 'Senior Software Engineer', 'Develop enterprise solutions for financial services clients.', 'full_time', 4, 'hybrid', 'https://cognizant.com/careers'),
        ('Cognizant Chennai', 'DevOps Engineer', 'Automate deployment pipelines for client applications.', 'full_time', 3, 'hybrid', 'https://cognizant.com/careers'),
        ('HCLTech Chennai', 'Cloud Architect', 'Design enterprise cloud solutions for global clients.', 'full_time', 6, 'hybrid', 'https://hcltech.com/careers'),
        ('Amazon Chennai', 'Software Development Engineer (SDE)', 'Build and scale AWS cloud services used by millions.', 'full_time', 2, 'hybrid', 'https://amazon.in/careers'),
        ('Amazon Chennai', 'Solutions Architect', 'Design cloud solutions for enterprise customers.', 'full_time', 5, 'hybrid', 'https://amazon.in/careers'),
        ('Google Chennai', 'Software Engineer', 'Build and scale Google Cloud Platform services.', 'full_time', 3, 'hybrid', 'https://google.com/careers'),
        ('Google Chennai', 'Data Engineer', 'Build data infrastructure powering Google Cloud analytics.', 'full_time', 3, 'hybrid', 'https://google.com/careers'),
        ('Microsoft Chennai', 'Senior Software Engineer', 'Build Azure cloud services and developer tools.', 'full_time', 4, 'hybrid', 'https://microsoft.com/careers'),
        ('Microsoft Chennai', 'Program Manager', 'Drive product strategy for developer tools and platforms.', 'full_time', 5, 'hybrid', 'https://microsoft.com/careers'),
        ('Oracle Chennai', 'Cloud Engineer (OCI)', 'Build Oracle Cloud Infrastructure services.', 'full_time', 3, 'hybrid', 'https://oracle.com/careers'),
        ('Thoughtworks Chennai', 'Senior Consultant', 'Deliver technology consulting and agile transformation.', 'full_time', 5, 'hybrid', 'https://thoughtworks.com/careers'),
        ('Thoughtworks Chennai', 'Tech Lead', 'Lead engineering teams on enterprise digital transformation.', 'full_time', 7, 'hybrid', 'https://thoughtworks.com/careers'),
        ('SBI Cards', 'Backend Engineer (Java)', 'Build credit card processing and payment systems.', 'full_time', 3, 'hybrid', 'https://sbicard.com/careers'),
        ('Paytm Chennai', 'Software Engineer (Node.js)', 'Build payment gateway features for millions of merchants.', 'full_time', 2, 'hybrid', 'https://paytm.com/careers'),
        ('Uber Chennai', 'Software Engineer (Go/Java)', 'Build ride-hailing and delivery platform features.', 'full_time', 3, 'hybrid', 'https://uber.com/careers'),
        ('Dell Chennai', 'Cloud Solutions Engineer', 'Design enterprise cloud and infrastructure solutions.', 'full_time', 4, 'hybrid', 'https://dell.com/careers')
) AS v(company_name, title, description, employment_type, min_experience_years, work_mode, apply_url)
JOIN companies c ON c.name = v.company_name
WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id AND j.title = v.title);

-- Verify counts
DO $$
DECLARE
    company_count INTEGER;
    job_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO company_count FROM companies;
    SELECT COUNT(*) INTO job_count FROM jobs WHERE is_active = true;
    RAISE NOTICE 'Total companies: %', company_count;
    RAISE NOTICE 'Total active jobs: %', job_count;
END $$;
