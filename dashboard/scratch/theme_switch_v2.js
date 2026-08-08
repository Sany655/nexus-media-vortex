const fs = require('fs');

const filesToProcess = [
  'c:/All/works/nexus-media-vortex/dashboard/src/app/page.tsx',
  'c:/All/works/nexus-media-vortex/dashboard/src/app/(auth)/login/page.tsx',
  'c:/All/works/nexus-media-vortex/dashboard/src/app/(auth)/register/page.tsx'
];

// Re-add dark variants
const replacements = [
  { from: /bg-neutral-50\b/g, to: 'bg-neutral-50 dark:bg-neutral-950' },
  { from: /bg-white\b/g, to: 'bg-white dark:bg-[#111111]' },
  { from: /bg-neutral-100\b/g, to: 'bg-neutral-100 dark:bg-[#0a0a0a]' },
  { from: /bg-neutral-200\b/g, to: 'bg-neutral-200 dark:bg-[#1a1a1a]' },
  
  { from: /text-neutral-900\b/g, to: 'text-neutral-900 dark:text-white' },
  { from: /text-neutral-800\b/g, to: 'text-neutral-800 dark:text-neutral-200' },
  { from: /text-neutral-700\b/g, to: 'text-neutral-700 dark:text-neutral-300' },
  { from: /text-neutral-600\b/g, to: 'text-neutral-600 dark:text-neutral-400' },
  
  { from: /text-white bg-emerald-600\b/g, to: 'text-white dark:text-black bg-emerald-600 dark:bg-emerald-500' },
  { from: /hover:bg-emerald-700\b/g, to: 'hover:bg-emerald-700 dark:hover:bg-emerald-600' },
  
  { from: /border-black\/5\b/g, to: 'border-black/5 dark:border-white/5' },
  { from: /border-black\/10\b/g, to: 'border-black/10 dark:border-white/10' },
  { from: /border-black\/\[0\.05\]/g, to: 'border-black/[0.05] dark:border-white/[0.05]' },
  
  { from: /bg-black\/5\b/g, to: 'bg-black/5 dark:bg-white/5' },
  { from: /bg-black\/\[0\.02\]/g, to: 'bg-black/[0.02] dark:bg-white/[0.01]' },
  { from: /hover:bg-black\/10\b/g, to: 'hover:bg-black/10 dark:hover:bg-white/10' },
  { from: /border-black\/20\b/g, to: 'border-black/20 dark:border-white/30' },
];

filesToProcess.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // First, let's remove any stray dark: classes if the script was run multiple times
    content = content.replace(/dark:[a-zA-Z0-9-\/\[\]#]+\s?/g, '');
    
    // Then apply replacements
    replacements.forEach(r => {
      content = content.replace(r.from, r.to);
    });
    
    fs.writeFileSync(file, content);
    console.log(`Processed: ${file}`);
  } else {
    console.error(`File not found: ${file}`);
  }
});

console.log("Done.");
