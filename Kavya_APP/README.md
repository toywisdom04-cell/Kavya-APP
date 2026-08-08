# Kavya VIP - Cyberpunk Neon Application

## Supabase cloud connection

The user portal (`index.html`) and admin portal (`index2.html`) now share the same Supabase project for authentication, media metadata, and media files.

1. In Supabase, open **SQL Editor** and run [supabase/schema.sql](supabase/schema.sql).
2. Create your administrator account through the deployed **user portal** first (use a strong, unique password).
3. In SQL Editor, run the final commented `update public.profiles ...` line in `schema.sql`, replacing the sample email with the administrator account email.
4. Sign in to the admin portal with that same account. Upload a picture or video, then press **Force Real-time Cloud Sync Now**. The user portal receives database updates through Supabase Realtime.
5. Use **Export Users & Media to Excel / CSV** in the admin portal to download all recorded sign-ups as a spreadsheet-compatible CSV file.

The browser-only publishable key is embedded in both HTML files by design. Never put a Supabase `sb_secret_*`, `service_role`, or database password in either site. Access is enforced by the Row Level Security policies in the SQL setup.

## Cashfree credit-pack payments

The `CLAIM FOR ₹50` and `CLAIM FOR ₹150` buttons create Cashfree orders through Supabase Edge Functions. Credits are added only after the signed Cashfree webhook confirms a successful payment; the browser never receives Cashfree secret keys.

1. Run the updated [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor.
2. Copy the values in [supabase/functions/.env.example](supabase/functions/.env.example) into Supabase Edge Function secrets. Start with `CASHFREE_ENVIRONMENT=sandbox`.
3. Deploy `cashfree-create-order` with JWT verification enabled. Deploy `cashfree-webhook` with JWT verification disabled (for example, `supabase functions deploy cashfree-webhook --no-verify-jwt`), because Cashfree cannot supply a user JWT; its HMAC signature verification in the function remains mandatory.
4. In Cashfree Dashboard, whitelist the website domain and configure the payment webhook URL as `https://<project-ref>.supabase.co/functions/v1/cashfree-webhook`. Enable payment-success notifications.
5. Test in Cashfree sandbox. When ready, change the secrets to live Cashfree credentials, set `CASHFREE_ENVIRONMENT=production`, and update the return URL to the live domain.

Do not grant credits from frontend JavaScript, expose `CASHFREE_CLIENT_SECRET`, or use the checkout return page as payment proof. Cashfree’s signed webhook is the fulfilment source of truth.

A vibrant Cyberpunk Neon application featuring a **Dedicated Admin Portal**, **Separate User Portal**, **WhatsApp/Instagram Style File Uploads**, **Central Cloud Synchronization across APK & Web**, and **TeraBox/Excel Database Backup Capabilities**.

![Kavya VIP Person](assets/person.jpeg)

---

## 🔗 Portals Overview

### 1. User Portal (`kavya-web-deploy/index.html`)
- **Web Link**: `https://kavya-web-deploy.vercel.app/`
- **Features**:
  - Two explicit buttons on Page 1: **SIGN IN** and **SIGN UP**.
  - **Credential Validation**:
    - **SIGN IN**: Checks stored credentials. Shows `"Email or Password not correct!"` if invalid.
    - **SIGN UP**: Prevents duplicate account creation for linked emails and prompts users to Sign In.
  - **Navigation Drawer Title**: Changed to logo **`KAVYA [VIP]`**.
  - **Model Name**: Updated to **`Kavya Rachana`** across all cards and live views.
  - **Default Tier Status**: Defaulted to **Normal User** until purchasing credit packages.
  - **NSFW Page**: Pics & videos marked NSFW appear on their own page and never show in Trending.
  - **Fixed Default Media**: The two admin-set default panels are pinned at the first two spots in Images and Trending.
  - **Live Counts**: The live menu bar shows a default of 50K likes and 20K comments.

### 2. Admin Portal (`admin-upload/index.html`)
- **Web Link**: `https://admin-upload-ten.vercel.app/`
- **Admin access**: Sign in with your Supabase user account after granting that account the `admin` role as described above.
- **Features**:
  - **WhatsApp / Instagram Style File Picker**: Drag & drop or upload photos (JPG, PNG) and videos (MP4, WEBM) directly from your mobile phone or computer!
  - **Central Cloud Broadcast**: Any media published from `admin.html` is synchronized instantly to all user APK mobile apps and Webpage links worldwide!
  - **TeraBox & Excel Export/Import**: Export users & media to CSV/Excel for safekeeping on TeraBox.
  - **All Users Details (Excel / CSV)**: One-click export of every account with S.no, Name, Email, Password, signup location, signup date/time, and last login date/time. Password resets appear as attached bottom rows under the same email.
  - **NSFW Uploads**: Mark any pic or video as NSFW so it appears only on the dedicated NSFW page and never in the Trending panel.
  - **2 Fixed Default Media Panels**: Set two default media slots that always stay pinned at positions 1 and 2 of the Images gallery and Trending section; every new upload renders beside them.

---

## 📱 Mobile APK & Web Links

- **User Web Portal**: [https://kavya-web-deploy.vercel.app/](https://kavya-web-deploy.vercel.app/)
- **Admin Portal**: [https://admin-upload-ten.vercel.app/](https://admin-upload-ten.vercel.app/)
- **Android APK File**: [Kavya VIP.apk](file:///E:/pinokio/api/Kavya_APP/Kavya%20VIP.apk)
