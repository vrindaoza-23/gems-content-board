# GEMS Content Review: setup (signed in as hello@alignd.in)

## 1. Update the script (2 minutes)
1. Open the **GEMS Content Reviews** Sheet and choose **Extensions → Apps Script**.
2. Select all the code in `Code.gs`, delete it, and paste in the new `review/Code.gs`. Click **Save**.
3. Click **Deploy → Manage deployments**, then the pencil icon. Set **Version** to **New version**, then click **Deploy**. The URL stays the same.
4. In the bar at the top of the editor, choose **setup** from the function list (next to **Debug**) and click **Run**. This creates the Users, Reviews, Activity and Config tabs. If Google asks for permission, click **Allow**.

## 2. Fill the Config tab (1 minute)
Go to the **Config** tab:
- **B1** (content_key): paste the content key Claude gave you. It unlocks the posts after login.
- **B2** (api_secret): paste the API secret Claude gave you. It lets the Content Studio read the reviews.
Keep both private. Anyone who has the content key and the page can read the drafts.

## 3. Add people (any time)
In the **Users** tab, add one row per person:
- **email**: their email address
- **name**: their name as it should appear on reviews
- **active**: yes
Leave the other columns empty. The person opens the site, enters their email, and chooses their own password.

- **Forgotten password:** clear their `pass_hash` cell. They choose a new one at next sign-in.
- **Remove access:** set `active` to `no`, or delete the row. Their login stops working at once.
- **History:** everything is in **Activity** (sign-ins, failed sign-ins, password set, sign-outs) and **Reviews** (approvals, change requests, comments, "seen", with the quoted text).

## What the script can and can't do
- It reads and writes only this Sheet (`@OnlyCurrentDoc`): no other files, no email.
- Passwords are stored only as salted SHA-256 hashes. Logins last 6 hours. Six wrong passwords lock that email for 15 minutes.
