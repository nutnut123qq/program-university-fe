import { createSlice } from "@reduxjs/toolkit"

interface AppState {
    sidebarOpen: boolean
    theme: "light" | "dark" | "system"
}

const initialState: AppState = {
    sidebarOpen: false,
    theme: "system",
}

const appSlice = createSlice({
    name: "app",
    initialState,
    reducers: {
        toggleSidebar: (state) => {
            state.sidebarOpen = !state.sidebarOpen
        },
        setTheme: (state, action) => {
            state.theme = action.payload
        },
    },
})

export const { toggleSidebar, setTheme } = appSlice.actions
export const appReducer = appSlice.reducer
