// Branded loading state: the Marevlo mark as its own skeleton — dimmed logo
// with a sheen sweeping through its silhouette (see .logo-loader* in index.css).
const LogoLoader = ({ label = '', size = 'w-24' }) => {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4" role="status" aria-label={label || 'Loading'}>
            <div className={`logo-loader relative ${size} aspect-[1559/1167]`}>
                <div className="logo-loader-glow" aria-hidden="true" />
                <img src="/logo/logo marevlo.svg" alt="" className="logo-loader-base h-full w-full object-contain" />
                <div className="logo-loader-sheen" aria-hidden="true" />
            </div>
            {label && <span className="text-sm text-muted-foreground">{label}</span>}
        </div>
    );
};

export default LogoLoader;
