# Connect the review site to a Google Sheet (one time, about 5 minutes)

Do this signed in to Google as **hello@alignd.in**.

1. Go to **sheets.new** to create a new Google Sheet. Name it **GEMS Content Reviews**.
2. In the Sheet, choose **Extensions → Apps Script**.
3. Delete the code that is already there. Open `review/Code.gs` from this folder, copy all of it, and paste it in. Click **Save** (the disk icon).
4. Click **Deploy → New deployment**. Click the gear icon next to "Select type" and choose **Web app**.
   - Description: `GEMS reviews`
   - Execute as: **Me (hello@alignd.in)**
   - Who has access: **Anyone**
   - Click **Deploy**.
5. Google asks for permission. Click **Authorize access** and choose hello@alignd.in.
   - If you see "Google hasn't verified this app", click **Advanced**, then **Go to … (unsafe)**. This is your own script, and it's normal for scripts you write yourself.
   - The permission listed should read **"View and manage spreadsheets that this application has been installed in"**. That means only this one Sheet. Click **Allow**.
6. Copy the **Web app URL**. It ends in `/exec`. Send it to Claude.

## What the script can and can't do
- It can add rows to the "Reviews" tab of this Sheet and read them back. That's all.
- It can't open any other file, your email or your Drive (`@OnlyCurrentDoc`).
- It rejects empty or oversized entries, and stops text being read as a spreadsheet formula.
- Junk rows can be deleted from the Sheet like any other row.

## If step 4 offers only "Anyone within alignd.in"
Your Google Workspace admin has blocked public web apps. Either ask the admin to allow them, or do these steps from a personal Gmail account and share the Sheet with hello@alignd.in.
