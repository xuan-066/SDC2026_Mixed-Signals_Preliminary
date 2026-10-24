import { createContext, useContext } from 'react';

export const ViewOnlyDemoContext = createContext(false);
export const useViewOnlyDemo = () => useContext(ViewOnlyDemoContext);
