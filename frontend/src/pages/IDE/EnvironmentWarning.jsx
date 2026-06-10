import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * EnvironmentWarning - Displays important environment information
 */
const EnvironmentWarning = () => {
    return (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 px-5 py-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900 leading-relaxed">
                <strong className="text-amber-950 font-semibold">Note:</strong> This is a standard Python environment. You must define your own classes, import modules, and call your function in a{' '}
                <code className="font-mono text-amber-950 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                    if __name__ == '__main__':
                </code>{' '}
                block to see output.
            </p>
        </div>
    );
};

export default EnvironmentWarning;
