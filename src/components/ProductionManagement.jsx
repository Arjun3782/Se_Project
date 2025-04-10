import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { 
  fetchRawMaterial, 
  addCompletedProductionToStockOrders,
  addCompletedProductionToStock  
} from "../features/materialSlice";
import { useForm } from "react-hook-form";
import axios from "axios";
import "./ProductionManagement.css";

const createAuthAxios = () => {
  const token = localStorage.getItem('token');
  return axios.create({
    baseURL: 'http://localhost:3000',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
};

export default function ProductionManagement() {
  const dispatch = useDispatch();
  const [selectedProduction, setSelectedProduction] = useState(null);
  const [showSalesOrderForm, setShowSalesOrderForm] = useState(false);
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return () => {
      delete axios.defaults.headers.common['Authorization'];
    };
  }, []);
  
  const rawMaterials = useSelector(state => {
    if (state.material && state.material.rawMaterial && state.material.rawMaterial.originalResponse) {
      return state.material.rawMaterial.originalResponse.r_data || [];
    } else if (state.material && state.material.rawMaterial) {
      return state.material.rawMaterial;
    } else if (state.material && state.material.data) {
      return state.material.data;
    } else if (state.material && state.material.r_data) {
      return state.material.r_data;
    } else {
      return [];
    }
  });
  
  const materialLoading = useSelector(state => state.material.loading);
  const materialError = useSelector(state => state.material.error);
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (materialError && materialError.message === "Authentication token missing") {
      console.log("Authentication error detected, redirecting to login");
      window.location.href = '/login';
    }
  }, [materialError]);
  
  const fetchProductions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login';
        return;
      }
      const authAxios = createAuthAxios();
      const response = await authAxios.get("/api/production/getProductions");
      setProductions(response.data.data || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching productions:", err.response?.data || err.message);
      setError(err.response?.data || { error: err.message });
      if (err.response?.status === 401) {
        alert("Your session has expired. Please login again.");
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };
  
  const updateStatus = async (id, newStatus) => {
    try {
      const production = productions.find(p => p._id === id);
      const authAxios = createAuthAxios();
      console.log("Before update API call - token:", localStorage.getItem('token').substring(0, 10) + "...");
      const updatedData = { status: newStatus };
      
      if (newStatus === "Completed") {
        updatedData.endDate = new Date();
      }
      
      const updatedProduction = await authAxios.put(
        `/api/production/updateProduction/${id}`,
        updatedData
      );
      
      console.log("After update API call - token:", localStorage.getItem('token').substring(0, 10) + "...");
      
      setProductions(prev => 
        prev.map(prod => prod._id === id ? updatedProduction.data.data : prod)
      );
      setError(null);
      
      if (newStatus === "Completed") {
        const completedProduction = updatedProduction.data.data || production;
        
        console.log("Before addCompletedProduction API call - token:", localStorage.getItem('token').substring(0, 10) + "...");
        
        try {
          await authAxios.post(
            "/api/product/addCompletedProduction",
            { production: completedProduction }
          );
          
          console.log("After addCompletedProduction API call - token:", localStorage.getItem('token').substring(0, 10) + "...");
          console.log("Production data added to products database");
        } catch (err) {
          console.error("Failed to add production to products:", err);
          
          if (err.response && err.response.status === 401) {
            alert("Your session has expired. Please login again.");
            localStorage.removeItem('token');
            window.location.href = '/login';
          }
        }
        
        setSelectedProduction(completedProduction);
        dispatch(addCompletedProductionToStockOrders(completedProduction));
        setShowSalesOrderForm(true);
      }
      
      return updatedProduction.data;
    } catch (err) {
      console.error("Error updating production:", err.response?.data || err.message);
      setError(err.response?.data || { error: err.message });
      if (err.response?.status === 401) {
        window.location.href = '/login';
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchProductions();
      
      console.log("Dispatching fetchRawMaterial action");
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      dispatch(fetchRawMaterial())
        .unwrap()
        .then(response => {
          console.log("Raw materials fetch successful:", response);
          
          if (response && (response.r_data || response.data)) {
            console.log("Raw materials data received:", response.r_data || response.data);
          } else {
            console.warn("Raw materials response is missing expected data structure");
            
            setTimeout(() => {
              console.log("Retrying raw materials fetch...");
              dispatch(fetchRawMaterial());
            }, 1000);
          }
        })
        .catch(error => {
          console.error("Error in raw materials fetch:", error);
          
          setTimeout(() => {
            console.log("Retrying raw materials fetch after error...");
            dispatch(fetchRawMaterial());
          }, 2000);
        });
    } else {
      window.location.href = '/login';
    }
  }, [dispatch]);
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      productionId: "",
      productionName: "",
      startDate: new Date().toISOString().slice(0, 16),
      status: "Planned",
      materials: [],
      outputProduct: {
        productId: "",
        productName: "",
        quantity: "",
        unitCost: "",
        totalCost: "",
      },
      notes: "",
    },
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateId, setUpdateId] = useState(null);
  const [searchDate, setSearchDate] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const watchMaterials = watch("materials");
  const watchOutputQuantity = watch("outputProduct.quantity");
  
  useEffect(() => {
    console.log("Raw materials from Redux:", rawMaterials);
    if (!rawMaterials) {
      console.log("Raw materials is null or undefined");
      setAvailableMaterials([]);
      return;
    }
    let materialsToProcess = [];
    if (rawMaterials && rawMaterials.r_data && Array.isArray(rawMaterials.r_data)) {
      console.log("Processing r_data array with length:", rawMaterials.r_data.length);
      materialsToProcess = rawMaterials.r_data;
    } else if (rawMaterials && rawMaterials.data && Array.isArray(rawMaterials.data)) {
      console.log("Processing data array with length:", rawMaterials.data.length);
      materialsToProcess = rawMaterials.data;
    } else if (Array.isArray(rawMaterials)) {
      console.log("Processing raw materials as array with length:", rawMaterials.length);
      materialsToProcess = rawMaterials;
    } else {
      console.log("Raw materials has unexpected structure:", typeof rawMaterials);
      console.log("Raw materials keys:", Object.keys(rawMaterials));
      setAvailableMaterials([]);
      return;
    }
    const materialsJSON = JSON.stringify(materialsToProcess);
    if (materialsJSON === JSON.stringify(availableMaterials.flatMap(m => m.materials || []))) {
      console.log("Materials haven't changed, skipping processing");
      return;
    }
    if (materialsToProcess.length === 0) {
      console.log("No materials to process (empty array)");
      setAvailableMaterials([]);
      return;
    }
    console.log("First material item:", materialsToProcess[0]);
    try {
      const groupedMaterials = materialsToProcess.reduce((acc, material) => {
        if (!material) {
          console.log("Material is null or undefined");
          return acc;
        }
        const productId = material.p_id || material._id;
        if (!productId) {
          console.log("Material missing product ID:", material);
          return acc;
        }
        
        if (!acc[productId]) {
          acc[productId] = {
            p_id: productId,
            p_name: material.p_name || material.s_name || "Unknown Product",
            totalQuantity: 0,
            materials: [],
            price: material.price || 0
          };
        }
        
        const quantity = Number(material.quantity || 0);
        acc[productId].totalQuantity += quantity;
        acc[productId].materials.push(material);
        
        return acc;
      }, {});
      
      const materialsArray = Object.values(groupedMaterials);
      console.log("Processed available materials:", materialsArray);
      setAvailableMaterials(materialsArray);
    } catch (error) {
      console.error("Error processing materials:", error);
      setAvailableMaterials([]);
    }
  }, [rawMaterials]);
  
  useEffect(() => {
    if (selectedMaterials.length > 0 && watchOutputQuantity) {
      const totalMaterialCost = selectedMaterials.reduce(
        (sum, material) => sum + (material.quantityUsed * material.price), 0
      );
      const unitCost = totalMaterialCost / watchOutputQuantity;
      setValue("outputProduct.unitCost", unitCost.toFixed(2));
      setValue("outputProduct.totalCost", totalMaterialCost.toFixed(2));
    }
  }, [selectedMaterials, watchOutputQuantity, setValue]);
  const handleAddMaterial = (materialGroup) => {
    const dialog = document.createElement("dialog");
    dialog.className = "material-dialog";  
    dialog.innerHTML = `
      <h3>Add ${materialGroup.p_name}</h3>
      <p>Available: ${materialGroup.totalQuantity.toFixed(2)} kg</p>
      <input type="number" id="quantity-input" min="0.1" max="${materialGroup.totalQuantity}" step="0.1" value="1">
      <div class="dialog-buttons">
        <button id="cancel-btn">Cancel</button>
        <button id="add-btn">Add</button>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    document.getElementById("add-btn").addEventListener("click", () => {
      const quantityInput = document.getElementById("quantity-input");
      const quantity = parseFloat(quantityInput.value);
      if (quantity > 0 && quantity <= materialGroup.totalQuantity) {
        console.log("Adding material to selection:", {
          materialGroup,
          quantity,
          firstMaterial: materialGroup.materials[0]
        });
        setSelectedMaterials(prev => [
          ...prev, 
          {
            p_id: materialGroup.p_id,
            p_name: materialGroup.p_name,
            quantityUsed: quantity,
            price: materialGroup.price || materialGroup.materials[0]?.price || 0,
            materialId: materialGroup.materials[0]?._id || materialGroup.p_id
          }
        ]);
      }
      dialog.close();
      document.body.removeChild(dialog);
    });
    
    document.getElementById("cancel-btn").addEventListener("click", () => {
      dialog.close();
      document.body.removeChild(dialog);
    });
  };
  
  const handleRemoveMaterial = (index) => {
    setSelectedMaterials(prev => prev.filter((_, i) => i !== index));
  };
  
  const addProduction = async (productionData) => {
    setLoading(true);
    try {
      const response = await axios.post(
        "http://localhost:3000/api/production/addProduction",
        productionData
      );
      setProductions(prev => [...prev, response.data.data]);
      setError(null);
      return response.data;
    } catch (err) {
      console.error("Error adding production:", err.response?.data || err.message);
      setError(err.response?.data || { error: err.message });
      if (err.response?.status === 401) {
        window.location.href = '/login';
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  const updateProductionById = async (id, productionData) => {
    setLoading(true);
    try {
      const response = await axios.put(
        `http://localhost:3000/api/production/updateProduction/${id}`,
        productionData
      );
      setProductions(prev => 
        prev.map(prod => prod._id === id ? response.data.data : prod)
      );
      setError(null);
      return response.data;
    } catch (err) {
      console.error("Error updating production:", err.response?.data || err.message);
      setError(err.response?.data || { error: err.message });
      if (err.response?.status === 401) {
        window.location.href = '/login';
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  const deleteProductionById = async (id) => {
    setLoading(true);
    try {
      await axios.delete(`http://localhost:3000/api/production/deleteProduction/${id}`);
      setProductions(prev => prev.filter(prod => prod._id !== id));
      setError(null);
    } catch (err) {
      console.error("Error deleting production:", err.response?.data || err.message);
      setError(err.response?.data || { error: err.message });
      if (err.response?.status === 401) {
        window.location.href = '/login';
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };
  const onSubmit = async (data) => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error("No authentication token found");
      window.location.href = '/login';
      return;
    }
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const companyId = user.companyId;
    if (!companyId) {
      console.error("No company ID found");
      return;
    }
    if (selectedMaterials.length === 0) {
      alert("Please select at least one raw material for this production");
      return;
    }
    try {
      await dispatch(fetchRawMaterial()).unwrap();
      console.log("Raw materials refreshed before submission");
    } catch (error) {
      console.error("Failed to refresh raw materials:", error);
    }
    if (!isUpdating) {
      const existingProduction = productions.find(p => p.productionId === data.productionId);
      if (existingProduction) {
        alert(`Production ID "${data.productionId}" already exists. Please use a different ID.`);
        return;
      }
    }
    const productionData = {
      ...data,
      materials: selectedMaterials,
      companyId
    };
    try {
      console.log("Selected materials to submit:", selectedMaterials);
      console.log("Available materials according to frontend:", availableMaterials);
      for (const material of selectedMaterials) {
        const availableMaterial = availableMaterials.find(m => m.p_id === material.p_id);
        console.log(`Checking material ${material.p_name}:`, {
          required: material.quantityUsed,
          available: availableMaterial ? availableMaterial.totalQuantity : 0,
          materialId: material.materialId || material.p_id,
          p_id: material.p_id
        });
        const requiredQty = parseFloat(material.quantityUsed);
        const availableQty = availableMaterial ? parseFloat(availableMaterial.totalQuantity) : 0;
        console.log('test',availableQty);
        if (!availableMaterial || availableQty < requiredQty) {
          alert(`Error: Insufficient quantity available for ${material.p_name}. 
                 Available: ${availableQty.toFixed(2)} kg, 
                 Required: ${requiredQty.toFixed(2)} kg`);
          return;
        }
      }
      const materialsWithIds = selectedMaterials.map(material => ({
        ...material,
        materialId: material.materialId || material.p_id, // Use p_id as fallback
        p_id: material.p_id
      }));
      const productionData = {
        ...data,
        materials: materialsWithIds,
        companyId
      };
      if (isUpdating) {
        await updateProductionById(updateId, productionData);
        setIsUpdating(false);
        setUpdateId(null);
        reset();
        setIsFormOpen(false);
        setSelectedMaterials([]);
        fetchProductions();
        dispatch(fetchRawMaterial());
      } else {
        await addProduction(productionData);
        reset();
        setIsFormOpen(false);
        setSelectedMaterials([]);
        fetchProductions();
        dispatch(fetchRawMaterial());
      }
    } catch (error) {
      console.error("Failed to save production:", error);
      if (error.response?.status === 404) {
        alert("Error: The server endpoint for this operation doesn't exist. Please contact your administrator.");
      } else if (error.response?.data?.error?.includes('duplicate key error')) {
        alert(`Production ID "${data.productionId}" already exists. Please use a different ID.`);
      } else if (error.response?.data?.error?.includes('insufficient quantity')) {
        alert(`Error: Some materials no longer have sufficient quantity available according to the server. 
               Please click "Refresh Data" and try again.`);
        dispatch(fetchRawMaterial());
      } else {
        alert(`Error: ${error.response?.data?.error || "Failed to save production. Please try again."}`);
      }
    }
  };
  
  const handleEdit = (production) => {
    setSelectedMaterials(production.materials || []);
    reset({
      productionId: production.productionId,
      productionName: production.productionName,
      startDate: new Date(production.startDate).toISOString().slice(0, 16),
      status: production.status,
      materials: production.materials || [],
      outputProduct: production.outputProduct || {
        productId: "",
        productName: "",
        quantity: "",
        unitCost: "",
        totalCost: "",
      },
      notes: production.notes || "",
    });
    setIsUpdating(true);
    setUpdateId(production._id);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error("No authentication token found");
      window.location.href = '/login';
      return;
    }
    if (window.confirm("Are you sure you want to delete this production?")) {
      try {
        await deleteProductionById(id);
        fetchProductions();
        dispatch(fetchRawMaterial());
      } catch (error) {
        console.error("Failed to delete production:", error);
      }
    }
  };
  
  const handleStatusChange = (id, currentStatus) => {
    const statusOptions = ["Planned", "In Progress", "Completed", "Cancelled"];
    const dialog = document.createElement("dialog");
    dialog.className = "status-dialog";
    const content = document.createElement("div");
    content.innerHTML = `
      <h3>Update Production Status</h3>
      <div class="status-options">
        ${statusOptions.map(status => `
          <button class="status-option ${status === currentStatus ? 'active' : ''}" 
                  data-status="${status}">
            ${status}
          </button>
        `).join('')}
      </div>
      <div class="dialog-buttons">
        <button id="cancel-btn">Cancel</button>
      </div>
    `;
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    dialog.showModal();
    const statusButtons = dialog.querySelectorAll('.status-option');
    statusButtons.forEach(button => {
      button.addEventListener('click', async () => {
        const newStatus = button.getAttribute('data-status');
        if (newStatus !== currentStatus) {
          try {
            const production = productions.find(p => p._id === id);
            const token = localStorage.getItem('token');
            console.log("token is :",token);
            if (!token) {
              alert("Your session has expired. Please login again.");
              window.location.href = '/login';
              return;
            }
            const authAxios = createAuthAxios();
            const updatedData = { 
              status: newStatus 
            };
            if (newStatus === "Completed") {
              updatedData.endDate = new Date();
            }
            console.log("Using token:", token.substring(0, 10) + "...");
            const updatedProduction = await authAxios.put(
              `/api/production/updateProduction/${id}`,
              updatedData
            );
            console.log("After update API call - token:", token.substring(0, 10) + "...");
            setProductions(prev => 
              prev.map(prod => prod._id === id ? updatedProduction.data.data : prod)
            );
            if (newStatus === "Completed") {
              const completedProduction = updatedProduction.data.data || production;
              console.log("Dispatching completed production to stock");
              console.log("Completed production data:", completedProduction);
              if (completedProduction && 
                  completedProduction.outputProduct && 
                  completedProduction.outputProduct.productId && 
                  completedProduction.outputProduct.productName && 
                  completedProduction.outputProduct.quantity) {
                console.log("product_id",completedProduction.outputProduct.productId);
                dispatch(addCompletedProductionToStock({
                  productId: completedProduction.outputProduct.productId,
                  productName: completedProduction.outputProduct.productName,
                  quantity: completedProduction.outputProduct.quantity,
                  unitCost: completedProduction.outputProduct.unitCost,
                  totalCost: completedProduction.outputProduct.totalCost,
                  productionId: completedProduction._id,
                  notes: `Produced from production ${completedProduction.productionName}`
                }));
                dispatch(addCompletedProductionToStockOrders(completedProduction));
                setSelectedProduction(completedProduction);
                setShowSalesOrderForm(true);
              } else {
                console.error("Cannot add to stock: Missing output product data", completedProduction);
                alert("Cannot complete production: Missing output product information. Please edit the production to add output product details.");
              }
            }
          } catch (error) {
            console.error("Failed to update status:", error);
            
            if (error.response && error.response.status === 401) {
              alert("Your session has expired. Please login again.");
              localStorage.removeItem('token');
              window.location.href = '/login';
            } else {
              alert(`Failed to update production: ${error.response?.data?.message || error.message}`);
            }
          } finally {
            if (document.body.contains(dialog)) {
              dialog.close();
              document.body.removeChild(dialog);
            }
          }
        } else {
          if (document.body.contains(dialog)) {
            dialog.close();
            document.body.removeChild(dialog);
          }
        }
      });
    });
    document.getElementById("cancel-btn").addEventListener("click", () => {
      if (document.body.contains(dialog)) {
        dialog.close();
        document.body.removeChild(dialog);
      }
    });
  };
  
  const filteredProductions = searchDate
    ? productions.filter((prod) => {
        if (!prod.startDate) return false;
        try {
          const prodDate = new Date(prod.startDate);
          if (isNaN(prodDate.getTime())) return false;
          
          const itemDate = prodDate.toISOString().split('T')[0];
          return itemDate === searchDate;
        } catch (error) {
          console.error("Date parsing error:", error);
          return false;
        }
      })
    : productions;
  
  return (
    <>
      <div className="container">
        <div className="dashboard">
          <h2>Production Dashboard</h2>
          <div className="production-overview">
            <div className="production-card">
              <h3>Total Productions</h3>
              <p>{productions.length}</p>
            </div>
            <div className="production-card">
              <h3>In Progress</h3>
              <p>{productions.filter(p => p.status === 'In Progress').length}</p>
            </div>
            <div className="production-card">
              <h3>Completed</h3>
              <p>{productions.filter(p => p.status === 'Completed').length}</p>
            </div>
          </div>
        </div>
        <div className="actions">
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
          />
          <button 
            className="refresh-button" 
            onClick={() => {
              console.log("Manually refreshing data...");
              fetchProductions();
              dispatch(fetchRawMaterial())
                .unwrap()
                .then(response => {
                  console.log("Raw materials fetched successfully:", response);
                })
                .catch(error => {
                  console.error("Error fetching raw materials:", error);
                });
            }}
          >
            ↻ Refresh Data
          </button>
          <button className="add-button" onClick={() => setIsFormOpen(true)}>
            + Add Production
          </button>
        </div>
        {isFormOpen && (
          <div className="overlay">
            <div className="form-popup">
              <h3>{isUpdating ? "Update Production" : "Add Production"}</h3>
              <form onSubmit={handleSubmit(onSubmit)}>
                <div>
                  <input
                    {...register("productionId", {
                      required: "Production ID is required",
                    })}
                    placeholder="Production ID"
                  />
                  {errors.productionId && (
                    <span className="error">{errors.productionId.message}</span>
                  )}
                </div>
                <div>
                  <input
                    {...register("productionName", {
                      required: "Production Name is required",
                    })}
                    placeholder="Production Name"
                  />
                  {errors.productionName && (
                    <span className="error">{errors.productionName.message}</span>
                  )}
                </div>
                <div className="material-selection-section">
                  <h4>Select Raw Materials</h4>
                  {console.log("Available materials in render:", availableMaterials)}
                  {console.log("Raw materials from Redux in render:", rawMaterials)}
                  <div className="available-materials">
                    <h5>Available Materials</h5>
                    {availableMaterials && availableMaterials.length > 0 ? (
                      <div className="materials-grid">
                        {availableMaterials.map((materialGroup) => (
                          <div key={materialGroup.p_id} className="material-card">
                            <h6>{materialGroup.p_name}</h6>
                            <p>Available: {materialGroup.totalQuantity.toFixed(2)} kg</p>
                            <button 
                              type="button" 
                              className="add-material-btn"
                              onClick={() => handleAddMaterial(materialGroup)}
                            >
                              + Add
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-materials">No raw materials available 
                        {materialLoading ? ' (Loading...)' : ''}
                        {!materialLoading && rawMaterials ? ' (Data structure: ' + (typeof rawMaterials) + ')' : ''}
                      </p>
                    )}
                  </div>
                  <div className="selected-materials">
                    <h5>Selected Materials</h5>
                    {selectedMaterials && selectedMaterials.length > 0 ? (
                      <table className="materials-table">
                        <thead>
                          <tr>
                            <th>Material</th>
                            <th>Quantity (kg)</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMaterials.map((material, index) => (
                            <tr key={index}>
                              <td>{material.p_name}</td>
                              <td>{material.quantityUsed.toFixed(2)}</td>
                              <td>
                                <button 
                                  type="button" 
                                  className="remove-material-btn"
                                  onClick={() => handleRemoveMaterial(index)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="3"><strong>Total Cost:</strong></td>
                            <td colSpan="2">
                              <strong>
                                ₹{selectedMaterials.reduce((sum, mat) => sum + (mat.quantityUsed * mat.price), 0).toFixed(2)}
                              </strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      <p className="no-materials">No materials selected</p>
                    )}
                  </div>
                </div>
                <div className="output-section">
                  <h4>Output Product</h4>
                  <div>
                    <input
                      {...register("outputProduct.productId", {
                        required: "Product ID is required",
                      })}
                      placeholder="Product ID"
                    />
                    {errors.outputProduct?.productId && (
                      <span className="error">{errors.outputProduct.productId.message}</span>
                    )}
                  </div>
                  <div>
                    <input
                      {...register("outputProduct.productName", {
                        required: "Product Name is required",
                      })}
                      placeholder="Product Name"
                    />
                    {errors.outputProduct?.productName && (
                      <span className="error">{errors.outputProduct.productName.message}</span>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      {...register("outputProduct.quantity", {
                        required: "Quantity is required",
                        min: { value: 0.01, message: "Quantity must be positive" },
                      })}
                      placeholder="Output Quantity (kg)"
                    />
                    {errors.outputProduct?.quantity && (
                      <span className="error">{errors.outputProduct.quantity.message}</span>
                    )}
                  </div>
                  <div>
                    <input
                      {...register("outputProduct.unitCost")}
                      readOnly
                      placeholder="Unit Cost (calculated)"
                    />
                  </div>
                  <div>
                    <input
                      {...register("outputProduct.totalCost")}
                      readOnly
                      placeholder="Total Cost (calculated)"
                    />
                  </div>
                </div>
                <div>
                  <input
                    type="datetime-local"
                    {...register("startDate")} 
                  />
                </div>
                <div>
                  <select {...register("status")}>
                    <option value="Planned">Planned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <textarea
                    {...register("notes")}
                    placeholder="Notes"
                  ></textarea>
                </div>
                <div className="buttons">
                  <button type="submit" className="save-button">
                    {isUpdating ? "Update" : "Add"}
                  </button>
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => {
                      reset();
                      setIsFormOpen(false);
                      setSelectedMaterials([]);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
                <div className="table-container">
                  <h3>Production List</h3>
                  {loading ? (
                    <p>Loading...</p>
                  ) : error ? (
                    <p className="error-message">Error: {error.message || "Failed to load productions"}</p>
                  ) : filteredProductions.length === 0 ? (
                    <p>No productions found.</p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Start Date</th>
                          <th>End Date</th>
                          <th>Status</th>
                          <th>Output Product</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProductions.map((production) => (
                          <tr key={production._id}>
                            <td>{production.productionId}</td>
                            <td>{production.productionName}</td>
                            <td>{production.startDate ? new Date(production.startDate).toLocaleString() : 'N/A'}</td>
                            <td>{production.endDate && !isNaN(new Date(production.endDate)) ? new Date(production.endDate).toLocaleString() : 'N/A'}</td>
                            <td className="status-column">
                              <span 
                                className={`status-badge ${production.status.toLowerCase().replace(' ', '-')}`}
                              >
                                {production.status}
                              </span>
                              <button
                                className="status-button"
                                onClick={() => handleStatusChange(production._id, production.status)}
                              >
                                Update Status
                              </button>
                            </td>
                            <td>
                              {production.outputProduct ? (
                                <>
                                  <div>{production.outputProduct.productName}</div>
                                  <div>Qty: {production.outputProduct.quantity}</div>
                                </>
                              ) : (
                                "N/A"
                              )}
                            </td>
                            <td>
                              <button
                                className="edit-button"
                                onClick={() => handleEdit(production)}
                              >
                                Edit
                              </button>
                              <button
                                className="delete-button"
                                onClick={() => handleDelete(production._id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
    </div>
  </>
  )
}
