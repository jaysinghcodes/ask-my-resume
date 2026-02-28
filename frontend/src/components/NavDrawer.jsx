import { useNavigate, useLocation } from "react-router-dom";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Box,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ContactMailOutlinedIcon from "@mui/icons-material/ContactMailOutlined";
import { useState } from "react";
import { NAV_ITEMS } from "../config/constants";

const ICON_MAP = {
  Chat: <ChatBubbleOutlineRoundedIcon />,
  About: <InfoOutlinedIcon />,
  Contact: <ContactMailOutlinedIcon />,
};

export function NavDrawer() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <>
      <IconButton
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        size="large"
        sx={{
          color: "text.primary",
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 1300,
          minWidth: 44,
          minHeight: 44,
          "&:hover": {
            bgcolor: "action.hover",
          },
        }}
      >
        <MenuIcon fontSize="medium" />
      </IconButton>
      <Drawer
        anchor="left"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: "min(280px, calc(100vw - 32px))", sm: 280 },
            maxWidth: "100vw",
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        <Box sx={{ pt: 8, px: 2 }}>
          <Typography
            variant="h2"
            sx={{
              fontSize: 18,
              fontWeight: 700,
              color: "primary.main",
              mb: 2,
              px: 1,
            }}
          >
            Ask Jay
          </Typography>
          <List disablePadding>
            {NAV_ITEMS.map(({ path, label }) => (
              <ListItemButton
                key={path}
                selected={location.pathname === path}
                onClick={() => handleNav(path)}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  "&.Mui-selected": {
                    bgcolor: "action.selected",
                    "&:hover": { bgcolor: "action.hover" },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: "primary.main" }}>
                  {ICON_MAP[label]}
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
}
