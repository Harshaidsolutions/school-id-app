# Public website design update 150

Website only: Android remains 1.0.149. No APK or backend rebuild needed.

Replaced the layered CSS with one responsive theme: teal, cream and coral, DM Sans typography, smaller headings, aligned product/contact/feature grids and compact client cards. Removed the duplicate homepage logo in favour of real product imagery. Added scroll reveals, floating product artwork, navigation and card hover transitions, with reduced-motion support. Updated all eight pages; preserved booking and enquiry operations. Versioned CSS/JS links refresh cached styling.

Validation: all eight routes at 390, 768 and 1366 pixels; no horizontal page overflow; one homepage brand logo; mobile menu open/Escape; booking recipient/message/image URL; JavaScript syntax and diff checks. Visual review of desktop/mobile homepage. Live site not deployed here.

PowerShell: run Apply-Push-Merge.ps1 from this extracted package.

EC2 from your repository folder:

    cd "$HOME/school-id-app"
    git pull --ff-only origin main
    bash harshaid-website/scripts/deploy-public.sh

The deployment script backs up /var/www/harshaidsolutions before copying. It also creates clean-URL index pages for the current Nginx try_files configuration. It does not replace SSL/Nginx settings. If your repository is elsewhere, cd to its actual path first.
